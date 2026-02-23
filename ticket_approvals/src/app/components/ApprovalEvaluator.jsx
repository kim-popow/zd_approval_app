import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Well } from '@zendeskgarden/react-notifications';
import { Button } from '@zendeskgarden/react-buttons';
import { Modal, Header, Body, Footer, Close } from '@zendeskgarden/react-modals';
import { Field, Label, Textarea } from '@zendeskgarden/react-forms';
import { Dots } from '@zendeskgarden/react-loaders';
import {
  EvaluationContainer,
  EvaluationSummary,
  CriteriaList,
  CriteriaItem,
  StatusBadge,
  WorkflowTracker,
  LevelBadge,
  ButtonGroup
} from '../styles/ApprovalEvaluator';

export const ApprovalEvaluator = ({ rules }) => {
  const APPROVAL_STARTED_TAG = 'credit_approval_started';
  const [ticketData, setTicketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [currentCustomStatusId, setCurrentCustomStatusId] = useState(null);
  const [prodOrderWarning, setProdOrderWarning] = useState('');
  const customStatusIdsRef = useRef({});
  const previousStatusRef = useRef(null);
  const autoAssignProcessedRef = useRef(false);
  const isProcessingStatusActionRef = useRef(false);
  const groupsRef = useRef([]);
  const currentGroupRef = useRef(null);
  const currentUserRef = useRef(null);
  const originalRequesterRef = useRef(null);
  const originalCreatorRef = useRef(null);
  const hasBeenSubmittedRef = useRef(false);
  const evaluationRef = useRef(null);

  const fetchRulesFromCustomObject = async () => {
    try {
      const response = await window.zafClient.request({
        url: '/api/v2/custom_objects/credit_memo_approval_rules/records',
        type: 'GET'
      });

      const records = response.custom_object_records || [];
      
      const loadedRules = records.map(record => ({
        id: record.id,
        ruleName: record.custom_object_fields.rule_name || '',
        creditTypeValue: record.custom_object_fields.credit_type_value || '',
        fieldName: record.custom_object_fields.field_name || '',
        operator: record.custom_object_fields.operator || '',
        value: record.custom_object_fields.value || '',
        fieldName2: record.custom_object_fields.field_name_2 || '',
        operator2: record.custom_object_fields.operator_2 || '',
        value2: record.custom_object_fields.value_2 || '',
        approvalLevel: record.custom_object_fields.approval_level || '',
        groupId: record.custom_object_fields.group_id || '',
        autoApprove: record.custom_object_fields.auto_approve === 'true' || record.custom_object_fields.auto_approve === true
      }));

      return loadedRules;
    } catch (error) {
      console.error('Error fetching rules from custom object:', error);
      return [];
    }
  };

  const normalizeOrderNumbers = (rawValue) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return [];

    if (Array.isArray(rawValue)) {
      return rawValue.map(value => String(value).trim()).filter(Boolean);
    }

    return String(rawValue)
      .split(/[\n,;]+/)
      .map(value => value.trim())
      .filter(Boolean);
  };

  const autoAssignToLevel1 = useCallback(async () => {
    if (autoAssignProcessedRef.current) {
      return;
    }
    
    try {
      const data = await window.zafClient.get([
        'ticket.id',
        'ticket.subject',
        'ticket.description',
        'ticket.status',
        'ticket.priority',
        'ticket.requester'
      ]);

      const groupsResponse = await window.zafClient.request({
        url: '/api/v2/groups.json',
        type: 'GET'
      });
      const fetchedGroups = groupsResponse.groups || [];

      const ticketFieldsResponse = await window.zafClient.get('ticketFields');
      const allFields = ticketFieldsResponse.ticketFields || [];
      
      const creditTypeField = allFields.find(field => {
        const fieldLabel = (field.label || field.title || '').toLowerCase();
        return fieldLabel.includes('type') && fieldLabel.includes('credit');
      });

      const prodOrderField = allFields.find(field => {
        const fieldLabel = (field.label || field.title || '').toLowerCase();
        const hasProd = fieldLabel.includes('product') || fieldLabel.includes('prod');
        const hasOrder = fieldLabel.includes('order');
        const hasId = fieldLabel.includes('id');
        return hasProd && hasOrder && hasId;
      });
      
      if (creditTypeField) {
        const creditTypeData = await window.zafClient.get(`ticket.customField:${creditTypeField.name}`);
        data[creditTypeField.name] = creditTypeData[`ticket.customField:${creditTypeField.name}`];
      }
      
      const customFields = allFields.filter(field => field.name && field.name.startsWith('custom_field_'));

      for (const field of customFields) {
        try {
          const fieldData = await window.zafClient.get(`ticket.customField:${field.name}`);
          data[field.name] = fieldData[`ticket.customField:${field.name}`];
        } catch (err) {
          // Field not accessible
        }
      }

      if (prodOrderField) {
        const prodOrderValue = data[prodOrderField.name];
        const orderNumbers = normalizeOrderNumbers(prodOrderValue);
        if (orderNumbers.length > 1) {
          setProdOrderWarning('Multiple Prod Order IDs detected. Please ensure only one Prod Order ID is in the field before submitting for approval.');
        } else {
          setProdOrderWarning('');
        }
      } else {
        setProdOrderWarning('');
      }
      
      const fetchedRules = await fetchRulesFromCustomObject();

      const evaluation = evaluateApproval(data, fetchedRules, fetchedGroups, creditTypeField?.name);

      if (evaluation.isAutoApproved) {
        await window.zafClient.request({
          url: `/api/v2/tickets/${data['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              custom_status_id: customStatusIdsRef.current.approved,
              additional_tags: [APPROVAL_STARTED_TAG],
              comment: {
                body: 'Credit memo automatically approved based on auto-approve rules.',
                public: false
              }
            }
          })
        });

        autoAssignProcessedRef.current = true;
        
        // Refresh the app to show the approved status
        setTimeout(() => {
          loadTicketData();
        }, 1000);
        
        return;
      }

      if (evaluation.requiresApproval && evaluation.approvalLevels.length > 0) {
        const level1 = evaluation.approvalLevels[0];

        await window.zafClient.request({
          url: `/api/v2/tickets/${data['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              group_id: level1.groupId,
              custom_status_id: customStatusIdsRef.current.pending_approval,
              additional_tags: [APPROVAL_STARTED_TAG],
              comment: {
                body: `Ticket automatically assigned to ${level1.groupName} (Level ${level1.level}) for approval.`,
                public: false
              }
            }
          })
        });

        autoAssignProcessedRef.current = true;
        
        // Refresh the app to show workflow details
        setTimeout(() => {
          loadTicketData();
        }, 1000);
      }
    } catch (error) {
      console.error('Error in autoAssignToLevel1:', error);
    }
  }, []);

  const initializeApp = async () => {
    try {
      const statusesResponse = await window.zafClient.request({
        url: '/api/v2/custom_statuses.json',
        type: 'GET'
      });

      const customStatuses = statusesResponse.custom_statuses || [];

      const submitForApprovalStatus = customStatuses.find(s => 
        s.agent_label && 
        s.agent_label.toLowerCase().includes('submit') && 
        s.agent_label.toLowerCase().includes('approval')
      );

      const pendingApprovalStatus = customStatuses.find(s => 
        s.agent_label && 
        s.agent_label.toLowerCase().includes('pending') && 
        s.agent_label.toLowerCase().includes('approval')
      );

      const approvedStatus = customStatuses.find(s => 
        s.agent_label && 
        s.agent_label.toLowerCase().includes('approved') &&
        !s.agent_label.toLowerCase().includes('pending')
      );

      const declinedStatus = customStatuses.find(s => 
        s.agent_label && 
        s.agent_label.toLowerCase().includes('declined')
      );

      customStatusIdsRef.current = {
        submit_for_approval: submitForApprovalStatus?.id,
        pending_approval: pendingApprovalStatus?.id,
        approved: approvedStatus?.id,
        declined: declinedStatus?.id
      };

      setupEventListeners();
      await loadTicketData();
    } catch (error) {
      console.error('Error initializing app:', error);
      setError(`Failed to initialize: ${JSON.stringify(error)}`);
      setLoading(false);
    }
  };

  const setupEventListeners = () => {
    window.zafClient.on('ticket.save', async () => {
      if (isProcessingStatusActionRef.current) {
        return;
      }

      if (previousStatusRef.current === customStatusIdsRef.current.declined) {
        autoAssignProcessedRef.current = false;
      }

      setTimeout(async () => {
        try {
          const ticketIdData = await window.zafClient.get('ticket.id');
          const ticketId = ticketIdData['ticket.id'];
          
          const ticketResponse = await window.zafClient.request({
            url: `/api/v2/tickets/${ticketId}.json`,
            type: 'GET'
          });

          const ticket = ticketResponse.ticket;
          const customStatusId = ticket.custom_status_id;
          const previousStatusId = previousStatusRef.current;
          const statusChanged = customStatusId !== previousStatusId;
          const submittedAlready =
            hasBeenSubmittedRef.current || (ticket.tags || []).includes(APPROVAL_STARTED_TAG);

          if (customStatusId === customStatusIdsRef.current.submit_for_approval) {
            if (!autoAssignProcessedRef.current) {
              await autoAssignToLevel1();
              previousStatusRef.current = customStatusIdsRef.current.submit_for_approval;
            }
            return;
          }

          if (!statusChanged) {
            return;
          }

          // Before first submission, only "Submit for Approval" is allowed.
          if (!submittedAlready) {
            try {
              isProcessingStatusActionRef.current = true;
              await window.zafClient.request({
                url: `/api/v2/tickets/${ticketId}.json`,
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                  ticket: {
                    custom_status_id: previousStatusId,
                    comment: {
                      body: 'Use "Submit for Approval" to submit this credit memo ticket.',
                      public: false
                    }
                  }
                })
              });
              setError('Use "Submit for Approval" to submit this credit memo ticket.');
              await loadTicketData();
            } finally {
              isProcessingStatusActionRef.current = false;
            }
            return;
          }

          // After first submission, status changes must not be used to move approvals.
          if (submittedAlready) {
            try {
              isProcessingStatusActionRef.current = true;
              await window.zafClient.request({
                url: `/api/v2/tickets/${ticketId}.json`,
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                  ticket: {
                    custom_status_id: previousStatusId,
                    comment: {
                      body: 'To approve or decline a credit memo ticket, please use the buttons within the approval app.',
                      public: false
                    }
                  }
                })
              });
              setError('To approve or decline a credit memo ticket, please use the buttons within the approval app.');
              await loadTicketData();
            } finally {
              isProcessingStatusActionRef.current = false;
            }
            return;
          }
          previousStatusRef.current = customStatusId;
        } catch (error) {
          console.error('Error checking ticket status after save:', error);
        }
      }, 1000);
    });
  };

  const loadTicketData = async () => {
    try {
      const data = await window.zafClient.get([
        'ticket.id',
        'ticket.subject',
        'ticket.description',
        'ticket.status',
        'ticket.priority',
        'ticket.requester',
        'currentUser'
      ]);

      const ticketId = data['ticket.id'];
      const ticketResponse = await window.zafClient.request({
        url: `/api/v2/tickets/${ticketId}.json`,
        type: 'GET'
      });

      const currentGroupId = ticketResponse.ticket.group_id;
      const currentStatusId = ticketResponse.ticket.custom_status_id;
      const ticketTags = ticketResponse.ticket.tags || [];
      hasBeenSubmittedRef.current =
        ticketTags.includes(APPROVAL_STARTED_TAG) ||
        currentStatusId === customStatusIdsRef.current.submit_for_approval ||
        currentStatusId === customStatusIdsRef.current.pending_approval ||
        currentStatusId === customStatusIdsRef.current.approved ||
        currentStatusId === customStatusIdsRef.current.declined;
      
      setCurrentCustomStatusId(currentStatusId);
      previousStatusRef.current = currentStatusId;

      if (currentStatusId === customStatusIdsRef.current.submit_for_approval && !autoAssignProcessedRef.current) {
        setTimeout(() => {
          if (!autoAssignProcessedRef.current) {
            autoAssignToLevel1();
          }
        }, 2000);
      }

      const groupsResponse = await window.zafClient.request({
        url: '/api/v2/groups.json',
        type: 'GET'
      });
      const fetchedGroups = groupsResponse.groups || [];
      groupsRef.current = fetchedGroups;

      if (currentGroupId) {
        const group = fetchedGroups.find(g => g.id === currentGroupId);
        setCurrentGroup(group || null);
        currentGroupRef.current = group || null;
      } else {
        currentGroupRef.current = null;
      }

      const ticketFieldsResponse = await window.zafClient.get('ticketFields');
      const allFields = ticketFieldsResponse.ticketFields || [];
      
      const creditTypeField = allFields.find(field => {
        const fieldLabel = (field.label || field.title || '').toLowerCase();
        return fieldLabel.includes('type') && fieldLabel.includes('credit');
      });

      const customFields = allFields.filter(field => field.name && field.name.startsWith('custom_field_'));

      for (const field of customFields) {
        try {
          const fieldData = await window.zafClient.get(`ticket.customField:${field.name}`);
          data[field.name] = fieldData[`ticket.customField:${field.name}`];
        } catch (err) {
          // Field not accessible
        }
      }

      setTicketData(data);
      currentUserRef.current = data.currentUser;
      originalRequesterRef.current = data['ticket.requester'];
      originalCreatorRef.current = null;

      if (ticketResponse.ticket.submitter_id) {
        try {
          const creatorResponse = await window.zafClient.request({
            url: `/api/v2/users/${ticketResponse.ticket.submitter_id}.json`,
            type: 'GET'
          });
          if (creatorResponse?.user) {
            originalCreatorRef.current = creatorResponse.user;
          }
        } catch (creatorErr) {
          // Fallback handled below.
        }
      }

      if (!originalCreatorRef.current && data['ticket.requester']) {
        originalCreatorRef.current = data['ticket.requester'];
      }

      if (data.currentUser && data.currentUser.groups) {
        const userGroupIds = data.currentUser.groups.map(g => g.id);
        const isInCurrentGroup = currentGroupId && userGroupIds.includes(currentGroupId);
        setCanApprove(isInCurrentGroup);
      }

      const fetchedRules = await fetchRulesFromCustomObject();

      const evaluation = evaluateApproval(data, fetchedRules, fetchedGroups, creditTypeField?.name);
      setEvaluation(evaluation);
      evaluationRef.current = evaluation;

      setLoading(false);
    } catch (err) {
      console.error('Error loading ticket data:', err);
      setError(`Failed to load ticket data: ${JSON.stringify(err)}`);
      setLoading(false);
    }
  };

  // Helper function to normalize numeric values by removing formatting (commas, etc.)
  const normalizeNumericValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    // Remove all non-numeric characters except decimal point
    const normalized = String(value).replace(/[^\d.]/g, '');
    return normalized;
  };

  // Helper function to check if a value is numeric (after normalization)
  const isNumericValue = (value) => {
    if (!value || value === '') return false;
    const normalized = normalizeNumericValue(value);
    return normalized !== '' && !isNaN(parseFloat(normalized));
  };

  // Helper function to compare values with formatting tolerance
  const compareValues = (fieldValue, ruleValue, operator) => {
    // Check if both values are numeric
    const fieldIsNumeric = isNumericValue(fieldValue);
    const ruleIsNumeric = isNumericValue(ruleValue);

    // For numeric operators, normalize and compare as numbers
    if (operator === 'greater_than' || operator === 'less_than') {
      // For comparison operators, try to parse as numbers even if only one is numeric
      const normalizedField = normalizeNumericValue(fieldValue);
      const normalizedRule = normalizeNumericValue(ruleValue);
      
      if (normalizedField && normalizedRule) {
        const fieldNum = parseFloat(normalizedField);
        const ruleNum = parseFloat(normalizedRule);
        
        if (!isNaN(fieldNum) && !isNaN(ruleNum)) {
          if (operator === 'greater_than') {
            return fieldNum > ruleNum;
          } else if (operator === 'less_than') {
            return fieldNum < ruleNum;
          }
        }
      }
      // If we can't parse as numbers, return false for comparison operators
      return false;
    }

    // If both are numeric, normalize and compare as numbers
    if (fieldIsNumeric && ruleIsNumeric) {
      const normalizedField = normalizeNumericValue(fieldValue);
      const normalizedRule = normalizeNumericValue(ruleValue);
      const fieldNum = parseFloat(normalizedField);
      const ruleNum = parseFloat(normalizedRule);

      switch (operator) {
        case 'equal_to':
          return fieldNum === ruleNum;
        case 'not_equal_to':
          return fieldNum !== ruleNum;
        default:
          // For other operators, fall back to string comparison
          break;
      }
    }

    // For non-numeric or mixed comparisons, use string comparison
    const fieldStr = String(fieldValue || '').toLowerCase();
    const ruleStr = String(ruleValue || '').toLowerCase();

    switch (operator) {
      case 'equal_to':
        // For equal_to, also try numeric comparison if one is numeric
        if (fieldIsNumeric || ruleIsNumeric) {
          const normalizedField = normalizeNumericValue(fieldValue);
          const normalizedRule = normalizeNumericValue(ruleValue);
          if (normalizedField && normalizedRule) {
            return parseFloat(normalizedField) === parseFloat(normalizedRule);
          }
        }
        return fieldStr === ruleStr;
      case 'not_equal_to':
        // For not_equal_to, also try numeric comparison if one is numeric
        if (fieldIsNumeric || ruleIsNumeric) {
          const normalizedField = normalizeNumericValue(fieldValue);
          const normalizedRule = normalizeNumericValue(ruleValue);
          if (normalizedField && normalizedRule) {
            return parseFloat(normalizedField) !== parseFloat(normalizedRule);
          }
        }
        return fieldStr !== ruleStr;
      case 'contains':
        // For contains, also check normalized numeric values
        if (fieldIsNumeric && ruleIsNumeric) {
          const normalizedField = normalizeNumericValue(fieldValue);
          const normalizedRule = normalizeNumericValue(ruleValue);
          return normalizedField.includes(normalizedRule) || normalizedRule.includes(normalizedField);
        }
        return fieldStr.includes(ruleStr);
      case 'not_contains':
        // For not_contains, also check normalized numeric values
        if (fieldIsNumeric && ruleIsNumeric) {
          const normalizedField = normalizeNumericValue(fieldValue);
          const normalizedRule = normalizeNumericValue(ruleValue);
          return !normalizedField.includes(normalizedRule) && !normalizedRule.includes(normalizedField);
        }
        return !fieldStr.includes(ruleStr);
      default:
        return false;
    }
  };

  const evaluateApproval = (data, rules, groups, creditTypeFieldId) => {
    const creditTypeValue = creditTypeFieldId ? data[creditTypeFieldId] : null;

    const triggeredRules = [];
    const approvalLevelsMap = new Map();

    const evaluateCriterion = (fieldValue, operator, ruleValue) => {
      switch (operator) {
        case 'greater_than':
        case 'less_than':
        case 'equal_to':
        case 'not_equal_to':
        case 'contains':
        case 'not_contains':
          return compareValues(fieldValue, ruleValue, operator);
        case 'is_empty':
          return !fieldValue || fieldValue === '';
        case 'is_not_empty':
          return fieldValue && fieldValue !== '';
        default:
          return false;
      }
    };

    rules.forEach((rule) => {
      if (rule.creditTypeValue && creditTypeValue !== rule.creditTypeValue) {
        return;
      }

      const fieldValue = data[rule.fieldName];
      const fieldValue2 = data[rule.fieldName2];

      const hasCompleteCriteria =
        !!rule.fieldName &&
        !!rule.operator &&
        !!rule.fieldName2 &&
        !!rule.operator2;
      if (!hasCompleteCriteria) {
        return;
      }

      const firstConditionMet = evaluateCriterion(fieldValue, rule.operator, rule.value);
      const secondConditionMet = evaluateCriterion(fieldValue2, rule.operator2, rule.value2);
      const conditionMet = firstConditionMet && secondConditionMet;

      if (conditionMet) {
        triggeredRules.push(rule);

        if (!rule.autoApprove && rule.approvalLevel && rule.groupId) {
          const level = parseInt(rule.approvalLevel);
          if (!approvalLevelsMap.has(level)) {
            const group = groups.find(g => g.id === parseInt(rule.groupId));
            approvalLevelsMap.set(level, {
              level,
              groupId: rule.groupId,
              groupName: group ? group.name : 'Unknown Group'
            });
          }
        }
      }
    });

    const approvalLevels = Array.from(approvalLevelsMap.values()).sort((a, b) => a.level - b.level);
    const allAutoApprove = triggeredRules.length > 0 && triggeredRules.every(rule => rule.autoApprove);

    return {
      requiresApproval: approvalLevels.length > 0,
      approvalLevels,
      triggeredRules,
      isAutoApproved: allAutoApprove
    };
  };

  const handleApprove = async (ticketId = ticketData?.['ticket.id']) => {
    const activeEvaluation = evaluationRef.current;
    const activeGroup = currentGroupRef.current;
    const activeUser = currentUserRef.current;
    const activeGroups = groupsRef.current;

    if (!ticketId || !activeEvaluation || !activeEvaluation.approvalLevels) return;

    const currentLevelIndex = activeEvaluation.approvalLevels.findIndex(
      level => level.groupId === String(activeGroup?.id)
    );

    if (currentLevelIndex < 0) {
      return;
    }

    const userGroupIds = activeUser?.groups?.map(group => group.id) || [];
    const isInCurrentGroup = activeGroup?.id && userGroupIds.includes(activeGroup.id);
    if (!isInCurrentGroup) {
      setError(`Only members of ${activeGroup?.name || 'the current approval group'} can approve this request.`);
      return;
    }

    const isLastLevel = currentLevelIndex === activeEvaluation.approvalLevels.length - 1;

    try {
      isProcessingStatusActionRef.current = true;

      if (isLastLevel) {
        const updateData = {
          ticket: {
            custom_status_id: customStatusIdsRef.current.approved,
            comment: {
              body: `Final approval granted by ${activeUser.name}. All required approvals complete.`,
              public: false
            }
          }
        };

        await window.zafClient.request({
          url: `/api/v2/tickets/${ticketId}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(updateData)
        });

        setCurrentCustomStatusId(customStatusIdsRef.current.approved);
        setCanApprove(false);
        setSuccessMessage('Final approval granted. All required approvals complete.');
      } else {
        const nextLevel = activeEvaluation.approvalLevels[currentLevelIndex + 1];

        await window.zafClient.request({
          url: `/api/v2/tickets/${ticketId}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              group_id: nextLevel.groupId,
              custom_status_id: customStatusIdsRef.current.pending_approval,
              comment: {
                body: `Approved by ${activeUser.name}. Ticket assigned to ${nextLevel.groupName} (Level ${nextLevel.level}) for next approval.`,
                public: false
              }
            }
          })
        });

        const nextGroup = activeGroups.find(g => g.id === parseInt(nextLevel.groupId));
        setCurrentGroup(nextGroup);
        currentGroupRef.current = nextGroup;
        setCurrentCustomStatusId(customStatusIdsRef.current.pending_approval);
        setSuccessMessage(`Approved and assigned to ${nextLevel.groupName} (Level ${nextLevel.level})`);
      }

      await loadTicketData();

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error approving:', error);
      setError(`Failed to approve: ${JSON.stringify(error)}`);
    } finally {
      isProcessingStatusActionRef.current = false;
    }
  };

  const handleDecline = async (ticketId = ticketData?.['ticket.id']) => {
    const activeUser = currentUserRef.current;
    const activeGroup = currentGroupRef.current;
    const activeCreator = originalCreatorRef.current;
    const activeRequester = originalRequesterRef.current;
    if (!ticketId || !activeUser) return;
    if (!declineReason.trim()) return;

    const userGroupIds = activeUser?.groups?.map(group => group.id) || [];
    const isInCurrentGroup = activeGroup?.id && userGroupIds.includes(activeGroup.id);
    if (!isInCurrentGroup) {
      setError(`Only members of ${activeGroup?.name || 'the current approval group'} can decline this request.`);
      return;
    }

    try {
      isProcessingStatusActionRef.current = true;
      const updatePayload = {
        ticket: {
          custom_status_id: customStatusIdsRef.current.declined,
          comment: {
            body: `Request declined by ${activeUser.name}.\n\nReason: ${declineReason}`,
            public: false
          }
        }
      };

      if (activeCreator && activeCreator.id) {
        updatePayload.ticket.assignee_id = activeCreator.id;
        updatePayload.ticket.group_id = null;
      } else if (activeRequester && activeRequester.id) {
        updatePayload.ticket.assignee_id = activeRequester.id;
        updatePayload.ticket.group_id = null;
      }

      await window.zafClient.request({
        url: `/api/v2/tickets/${ticketId}.json`,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(updatePayload)
      });

      setCurrentGroup(null);
      currentGroupRef.current = null;
      setCurrentCustomStatusId(customStatusIdsRef.current.declined);
      setShowDeclineModal(false);
      setDeclineReason('');
      setSuccessMessage(
        activeCreator?.name
          ? `Request declined and reassigned to ${activeCreator.name}`
          : 'Request declined and reassigned to original credit creator'
      );
      await loadTicketData();

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error declining:', error);
      setError(`Failed to decline: ${JSON.stringify(error)}`);
    } finally {
      isProcessingStatusActionRef.current = false;
    }
  };

  useEffect(() => {
    initializeApp();
  }, []);

  if (loading) {
    return (
      <EvaluationContainer>
        <Dots size="32" />
      </EvaluationContainer>
    );
  }

  if (error) {
    return (
      <EvaluationContainer>
        <Alert type="error">{error}</Alert>
      </EvaluationContainer>
    );
  }

  if (!evaluation) {
    return (
      <EvaluationContainer>
        <Alert type="info">Loading evaluation...</Alert>
      </EvaluationContainer>
    );
  }

  const isFullyApproved = currentCustomStatusId === customStatusIdsRef.current.approved;
  const isDeclined = currentCustomStatusId === customStatusIdsRef.current.declined;
  const isPendingApproval = currentCustomStatusId === customStatusIdsRef.current.pending_approval;
  const isPreSubmission =
    currentCustomStatusId &&
    currentCustomStatusId !== customStatusIdsRef.current.submit_for_approval &&
    currentCustomStatusId !== customStatusIdsRef.current.pending_approval &&
    currentCustomStatusId !== customStatusIdsRef.current.approved &&
    currentCustomStatusId !== customStatusIdsRef.current.declined;

  const currentLevelIndex = evaluation.approvalLevels.findIndex(
    level => level.groupId === String(currentGroup?.id)
  );
  const currentLevel = currentLevelIndex >= 0 ? evaluation.approvalLevels[currentLevelIndex] : null;

  return (
    <EvaluationContainer>
      {successMessage && (
        <Alert type="success" style={{ marginBottom: '16px' }}>
          {successMessage}
        </Alert>
      )}

      {isFullyApproved ? (
        <Alert type="success">All Approvals Complete</Alert>
      ) : isDeclined ? (
        <Alert type="error">Request Declined</Alert>
      ) : isPreSubmission ? (
        <Alert
          type="info"
          style={{
            backgroundColor: '#fff8e8',
            borderColor: '#f0dfb9',
            color: '#4a4a4a'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '14px', lineHeight: 1.5 }}>
            <div style={{ marginBottom: '10px' }}>Steps to Create a Credit Memo</div>
            <ol style={{ margin: 0, paddingLeft: '24px', listStyleType: 'decimal', listStylePosition: 'outside' }}>
              <li style={{ marginBottom: '8px' }}>Choose a credit type: Credit Memo or Check Request.</li>
              <li style={{ marginBottom: '8px' }}>Complete all required fields.</li>
              <li style={{ marginBottom: '8px' }}>Add an internal comment explaining the request.</li>
              <li style={{ marginBottom: '8px' }}>Set status to &quot;Submit for Approval&quot; only.</li>
              <li style={{ marginBottom: '8px' }}>If within your limit, the credit auto-approves and is sent to SAP; otherwise it routes for approval.</li>
              <li>After submission, no further status updates are needed. The system auto-solves credit tickets.</li>
            </ol>
          </div>
        </Alert>
      ) : evaluation.requiresApproval ? (
        <Alert type="warning">Approval Required</Alert>
      ) : (
        <Alert type="success">No Approval Required</Alert>
      )}

      {isPreSubmission && prodOrderWarning && (
        <Alert type="warning">{prodOrderWarning}</Alert>
      )}

      <Well style={{ marginTop: '16px' }}>
        <EvaluationSummary>
          <div>
            <strong>Ticket ID:</strong> {ticketData['ticket.id']}
          </div>
          <div>
            <strong>Subject:</strong> {ticketData['ticket.subject']}
          </div>
          <div>
            <strong>Current Group:</strong> {currentGroup ? currentGroup.name : 'Not assigned'}
          </div>
          <div>
            <StatusBadge status={isFullyApproved ? 'approved' : isDeclined ? 'declined' : (evaluation.requiresApproval || isPendingApproval || isPreSubmission) ? 'pending' : 'approved'}>
              {isFullyApproved
                ? 'FULLY APPROVED'
                : isDeclined
                  ? 'DECLINED'
                  : isPreSubmission
                    ? 'READY TO SUBMIT'
                    : evaluation.requiresApproval || isPendingApproval
                      ? 'REQUIRES APPROVAL'
                      : 'NO APPROVAL NEEDED'}
            </StatusBadge>
          </div>
        </EvaluationSummary>
      </Well>

      {evaluation.approvalLevels.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <h3>Approval Workflow</h3>
          <WorkflowTracker>
            {evaluation.approvalLevels.map((level, index) => {
              const isCompleted = currentLevelIndex > index;
              const isCurrent = currentLevelIndex === index;

              return (
                <LevelBadge
                  key={index}
                  status={isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}
                >
                  Level {level.level}: {level.groupName}
                </LevelBadge>
              );
            })}
          </WorkflowTracker>
        </div>
      )}

      {evaluation.triggeredRules.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <h3>Evaluation Criteria</h3>
          <CriteriaList>
            {evaluation.triggeredRules.map((rule, index) => (
              <CriteriaItem key={index} status="flagged">
                {rule.autoApprove ? (
                  <>✓ {rule.ruleName} - Auto-Approve</>
                ) : (
                  <>⚠ {rule.ruleName} - Requires Level {rule.approvalLevel} approval (all criteria matched)</>
                )}
              </CriteriaItem>
            ))}
          </CriteriaList>
        </div>
      )}

      {currentLevel && !isFullyApproved && !isDeclined && (
        <div style={{ marginTop: '16px' }}>
          {canApprove ? (
            <ButtonGroup>
              <Button
                isPrimary
                onClick={() => handleApprove()}
              >
                {currentLevelIndex === evaluation.approvalLevels.length - 1
                  ? 'Final Approval'
                  : `Approve & Assign to Level ${evaluation.approvalLevels[currentLevelIndex + 1].level}`}
              </Button>
              <Button
                isDanger
                onClick={() => setShowDeclineModal(true)}
              >
                Decline
              </Button>
            </ButtonGroup>
          ) : (
            <Alert type="info">
              You are not a member of the current approval group. Only members of {currentGroup?.name} can approve or decline this request.
            </Alert>
          )}
        </div>
      )}

      {showDeclineModal && (
        <Modal onClose={() => setShowDeclineModal(false)}>
          <Header>Decline Request</Header>
          <Body>
            <Field>
              <Label>Reason for declining (required)</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
                placeholder="Please provide a reason for declining this request..."
              />
            </Field>
          </Body>
          <Footer>
            <Button onClick={() => setShowDeclineModal(false)}>Cancel</Button>
            <Button
              isPrimary
              isDanger
              onClick={() => handleDecline()}
              disabled={!declineReason.trim()}
            >
              Decline Request
            </Button>
          </Footer>
          <Close aria-label="Close modal" />
        </Modal>
      )}
    </EvaluationContainer>
  );
};
