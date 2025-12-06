import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from '@zendeskgarden/react-notifications';
import { Well } from '@zendeskgarden/react-notifications';
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
  const [ticketData, setTicketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [originalRequester, setOriginalRequester] = useState(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [currentCustomStatusId, setCurrentCustomStatusId] = useState(null);
  const customStatusIdsRef = useRef({});
  const previousStatusRef = useRef(null);
  const autoAssignProcessedRef = useRef(false);
  const [creditTypeFieldId, setCreditTypeFieldId] = useState(null);

  const fetchRulesFromCustomObject = async () => {
    try {
      console.log('Fetching rules from custom object...');
      const response = await window.zafClient.request({
        url: '/api/v2/custom_objects/credit_memo_approval_rules/records',
        type: 'GET'
      });

      const records = response.custom_object_records || [];
      console.log('Custom object records fetched:', records.length);
      
      const loadedRules = records.map(record => ({
        id: record.id,
        ruleName: record.custom_object_fields.rule_name || '',
        creditTypeValue: record.custom_object_fields.credit_type_value || '',
        fieldName: record.custom_object_fields.field_name || '',
        operator: record.custom_object_fields.operator || '',
        value: record.custom_object_fields.value || '',
        approvalLevel: record.custom_object_fields.approval_level || '',
        groupId: record.custom_object_fields.group_id || '',
        autoApprove: record.custom_object_fields.auto_approve === 'true' || record.custom_object_fields.auto_approve === true
      }));

      console.log('Loaded rules:', loadedRules);
      return loadedRules;
    } catch (error) {
      console.error('Error fetching rules from custom object:', error);
      return [];
    }
  };

  const autoAssignToLevel1 = useCallback(async () => {
    console.log('=== AUTO ASSIGN TO LEVEL 1 START ===');
    console.log('autoAssignProcessedRef.current:', autoAssignProcessedRef.current);
    
    if (autoAssignProcessedRef.current) {
      console.log('Auto-assignment already processed for this ticket, skipping');
      return;
    }
    
    try {
      console.log('Step 1: Fetching ticket data...');
      const data = await window.zafClient.get([
        'ticket.id',
        'ticket.subject',
        'ticket.description',
        'ticket.status',
        'ticket.priority',
        'ticket.requester'
      ]);

      console.log('Step 2: Ticket data fetched:', {
        ticketId: data['ticket.id'],
        status: data['ticket.status']
      });

      console.log('Step 3: Fetching groups...');
      const groupsResponse = await window.zafClient.request({
        url: '/api/v2/groups.json',
        type: 'GET'
      });
      const fetchedGroups = groupsResponse.groups || [];
      console.log('Step 4: Groups fetched:', fetchedGroups.length);

      console.log('Step 5: Processing custom fields...');
      const ticketFieldsResponse = await window.zafClient.get('ticketFields');
      const allFields = ticketFieldsResponse.ticketFields || [];
      
      // Find Type of Credit field
      const creditTypeField = allFields.find(field => {
        const fieldLabel = (field.label || field.title || '').toLowerCase();
        return fieldLabel.includes('type') && fieldLabel.includes('credit');
      });
      
      if (creditTypeField) {
        console.log('Type of Credit field found:', creditTypeField.name);
        const creditTypeData = await window.zafClient.get(`ticket.customField:${creditTypeField.name}`);
        data[creditTypeField.name] = creditTypeData[`ticket.customField:${creditTypeField.name}`];
      }
      
      const customFields = allFields.filter(field => field.name && field.name.startsWith('custom_field_'));

      for (const field of customFields) {
        try {
          const fieldData = await window.zafClient.get(`ticket.customField:${field.name}`);
          data[field.name] = fieldData[`ticket.customField:${field.name}`];
        } catch (err) {
          console.log(`Could not fetch ${field.name}:`, err);
        }
      }

      console.log('Step 6: Complete ticket data for evaluation:', data);
      
      console.log('Step 7: Fetching rules from custom object...');
      const fetchedRules = await fetchRulesFromCustomObject();
      console.log('Step 8: Rules fetched:', fetchedRules);

      console.log('Step 9: Evaluating approval rules...');
      const evaluation = evaluateApproval(data, fetchedRules, fetchedGroups, creditTypeField?.name);
      console.log('Evaluation result:', evaluation);

      if (evaluation.isAutoApproved) {
        console.log('All triggered rules are auto-approve, setting status to approved');
        
        await window.zafClient.request({
          url: `/api/v2/tickets/${data['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              custom_status_id: customStatusIdsRef.current.approved,
              comment: {
                body: 'Credit memo automatically approved based on auto-approve rules.',
                public: false
              }
            }
          })
        });

        console.log('Ticket auto-approved successfully');
        autoAssignProcessedRef.current = true;
        return;
      }

      if (evaluation.requiresApproval && evaluation.approvalLevels.length > 0) {
        const level1 = evaluation.approvalLevels[0];
        console.log('Step 10: Level 1 to assign:', level1);

        console.log('Step 11: Assigning ticket to group via API...');
        const assignResponse = await window.zafClient.request({
          url: `/api/v2/tickets/${data['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              group_id: level1.groupId,
              custom_status_id: customStatusIdsRef.current.pending_approval,
              comment: {
                body: `Ticket automatically assigned to ${level1.groupName} (Level ${level1.level}) for approval.`,
                public: false
              }
            }
          })
        });

        console.log('Step 12: Assignment response:', assignResponse);
        console.log('Step 13: Setting autoAssignProcessedRef to true');
        autoAssignProcessedRef.current = true;
        console.log('Step 14: autoAssignProcessedRef.current is now:', autoAssignProcessedRef.current);
        console.log('=== AUTO ASSIGN TO LEVEL 1 COMPLETE ===');
      } else {
        console.log('No approval required - no rules were triggered');
      }
    } catch (error) {
      console.error('Error in autoAssignToLevel1:', error);
    }
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Fetching custom statuses to find status IDs...');
      const statusesResponse = await window.zafClient.request({
        url: '/api/v2/custom_statuses.json',
        type: 'GET'
      });

      const customStatuses = statusesResponse.custom_statuses || [];
      console.log('Custom statuses:', customStatuses);

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

      console.log('Custom status IDs set:', customStatusIdsRef.current);

      setupEventListeners();
      await loadTicketData();
    } catch (error) {
      console.error('Error initializing app:', error);
      setError(`Failed to initialize: ${JSON.stringify(error)}`);
      setLoading(false);
    }
  };

  const setupEventListeners = () => {
    console.log('Setting up event listeners...');

    window.zafClient.on('ticket.save', async () => {
      console.log('\n\n>>> TICKET SAVE EVENT FIRED <<<');
      console.log('Current autoAssignProcessedRef.current:', autoAssignProcessedRef.current);
      console.log('Current previousStatusRef.current:', previousStatusRef.current);
      console.log('Declined status ID:', customStatusIdsRef.current.declined);
      
      if (previousStatusRef.current === customStatusIdsRef.current.declined) {
        console.log('Previous status was declined - resetting workflow for resubmission');
        autoAssignProcessedRef.current = false;
      }

      console.log('Waiting 1 second before checking ticket status...');
      setTimeout(async () => {
        try {
          console.log('Fetching ticket ID...');
          const ticketIdData = await window.zafClient.get('ticket.id');
          const ticketId = ticketIdData['ticket.id'];
          console.log('Ticket ID:', ticketId);
          
          console.log('Fetching full ticket data from API...');
          const ticketResponse = await window.zafClient.request({
            url: `/api/v2/tickets/${ticketId}.json`,
            type: 'GET'
          });

          console.log('Full ticket data from API:', ticketResponse.ticket);
          console.log('Custom status ID from ticket:', ticketResponse.ticket.custom_status_id);
          console.log('Submit for approval status ID:', customStatusIdsRef.current.submit_for_approval);
          console.log('Status match?', ticketResponse.ticket.custom_status_id === customStatusIdsRef.current.submit_for_approval);

          if (ticketResponse.ticket.custom_status_id === customStatusIdsRef.current.submit_for_approval) {
            console.log('✓ Custom status matches submit_for_approval');
            console.log('Checking if already processed...');
            console.log('autoAssignProcessedRef.current before check:', autoAssignProcessedRef.current);
            
            if (!autoAssignProcessedRef.current) {
              console.log('✓ Not yet processed, triggering auto-assignment');
              await autoAssignToLevel1();
              previousStatusRef.current = customStatusIdsRef.current.submit_for_approval;
            } else {
              console.log('✗ Already processed, skipping auto-assignment');
            }
          } else {
            console.log('✗ Custom status does not match submit_for_approval');
            console.log('Expected:', customStatusIdsRef.current.submit_for_approval);
            console.log('Got:', ticketResponse.ticket.custom_status_id);
          }
        } catch (error) {
          console.error('Error checking ticket status after save:', error);
        }
      }, 1000);
    });

    console.log('Event listeners set up');
  };

  const loadTicketData = async () => {
    try {
      console.log('=== LOAD TICKET DATA START ===');
      
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
      
      console.log('Initial ticket load - custom_status_id:', currentStatusId);
      console.log('Submit for approval status ID:', customStatusIdsRef.current.submit_for_approval);
      
      setCurrentCustomStatusId(currentStatusId);
      previousStatusRef.current = currentStatusId;

      // Check if ticket is already in submit_for_approval status on initial load
      if (currentStatusId === customStatusIdsRef.current.submit_for_approval && !autoAssignProcessedRef.current) {
        console.log('Ticket is in submit_for_approval status on initial load, triggering auto-assignment after delay');
        setTimeout(() => {
          if (!autoAssignProcessedRef.current) {
            console.log('Delayed auto-assignment trigger');
            autoAssignToLevel1();
          }
        }, 2000);
      }

      const groupsResponse = await window.zafClient.request({
        url: '/api/v2/groups.json',
        type: 'GET'
      });
      const fetchedGroups = groupsResponse.groups || [];
      setGroups(fetchedGroups);

      if (currentGroupId) {
        const group = fetchedGroups.find(g => g.id === currentGroupId);
        setCurrentGroup(group || null);
      }

      const ticketFieldsResponse = await window.zafClient.get('ticketFields');
      const allFields = ticketFieldsResponse.ticketFields || [];
      
      // Find Type of Credit field - check both title and label
      const creditTypeField = allFields.find(field => {
        const fieldLabel = (field.label || field.title || '').toLowerCase();
        return fieldLabel.includes('type') && fieldLabel.includes('credit');
      });
      
      if (creditTypeField) {
        setCreditTypeFieldId(creditTypeField.name);
        console.log('Type of Credit field found:', creditTypeField.name);
      }

      const customFields = allFields.filter(field => field.name && field.name.startsWith('custom_field_'));

      for (const field of customFields) {
        try {
          const fieldData = await window.zafClient.get(`ticket.customField:${field.name}`);
          data[field.name] = fieldData[`ticket.customField:${field.name}`];
        } catch (err) {
          console.log(`Could not fetch ${field.name}`);
        }
      }

      setTicketData(data);
      setCurrentUser(data.currentUser);
      setOriginalRequester(data['ticket.requester']);

      if (data.currentUser && data.currentUser.groups) {
        const userGroupIds = data.currentUser.groups.map(g => g.id);
        const isInCurrentGroup = currentGroupId && userGroupIds.includes(currentGroupId);
        setCanApprove(isInCurrentGroup);
      }

      // CRITICAL FIX: Fetch rules from custom object instead of using prop
      console.log('Fetching rules for evaluation...');
      const fetchedRules = await fetchRulesFromCustomObject();
      console.log('Rules fetched for evaluation:', fetchedRules);

      const evaluation = evaluateApproval(data, fetchedRules, fetchedGroups, creditTypeField?.name);
      setEvaluation(evaluation);

      console.log('=== LOAD TICKET DATA END ===');
      setLoading(false);
    } catch (err) {
      console.error('Error loading ticket data:', err);
      setError(`Failed to load ticket data: ${JSON.stringify(err)}`);
      setLoading(false);
    }
  };

  const evaluateApproval = (data, rules, groups, creditTypeFieldId) => {
    console.log('=== EVALUATE APPROVAL START ===');
    console.log('Number of rules to evaluate:', rules.length);
    console.log('All rules:', rules);
    
    console.log('Ticket data keys:', Object.keys(data));
    console.log('Credit type field ID:', creditTypeFieldId);

    const creditTypeValue = creditTypeFieldId ? data[creditTypeFieldId] : null;
    console.log('Type of Credit Value from ticket:', creditTypeValue);

    const triggeredRules = [];
    const approvalLevelsMap = new Map();

    rules.forEach((rule, index) => {
      console.log(`\n--- Evaluating Rule ${index + 1}: ${rule.ruleName} ---`);
      console.log('Rule config:', {
        creditTypeValue: rule.creditTypeValue,
        fieldName: rule.fieldName,
        operator: rule.operator,
        value: rule.value,
        autoApprove: rule.autoApprove
      });

      if (rule.creditTypeValue && creditTypeValue !== rule.creditTypeValue) {
        console.log(`✗ Type of Credit mismatch: Expected "${rule.creditTypeValue}", Got "${creditTypeValue}"`);
        console.log(`Rule skipped due to Type of Credit mismatch`);
        return;
      }

      console.log(`✓ Type of Credit matches: ${rule.creditTypeValue}`);

      const fieldValue = data[rule.fieldName];
      console.log(`Field: ${rule.fieldName}`);
      console.log(`Field value: ${fieldValue} (type: ${typeof fieldValue})`);
      console.log(`Operator: ${rule.operator}`);
      console.log(`Threshold: ${rule.value} (type: ${typeof rule.value})`);
      console.log(`Auto-approve: ${rule.autoApprove}`);

      let conditionMet = false;

      switch (rule.operator) {
        case 'greater_than':
          conditionMet = parseFloat(fieldValue) > parseFloat(rule.value);
          console.log(`Comparison: ${fieldValue} > ${rule.value} = ${conditionMet}`);
          break;
        case 'less_than':
          conditionMet = parseFloat(fieldValue) < parseFloat(rule.value);
          console.log(`Comparison: ${fieldValue} < ${rule.value} = ${conditionMet}`);
          break;
        case 'equal_to':
          conditionMet = String(fieldValue).toLowerCase() === String(rule.value).toLowerCase();
          console.log(`Comparison: ${fieldValue} === ${rule.value} = ${conditionMet}`);
          break;
        case 'not_equal_to':
          conditionMet = String(fieldValue).toLowerCase() !== String(rule.value).toLowerCase();
          console.log(`Comparison: ${fieldValue} !== ${rule.value} = ${conditionMet}`);
          break;
        case 'contains':
          conditionMet = String(fieldValue).toLowerCase().includes(String(rule.value).toLowerCase());
          console.log(`Comparison: ${fieldValue} contains ${rule.value} = ${conditionMet}`);
          break;
        case 'not_contains':
          conditionMet = !String(fieldValue).toLowerCase().includes(String(rule.value).toLowerCase());
          console.log(`Comparison: ${fieldValue} not contains ${rule.value} = ${conditionMet}`);
          break;
        case 'is_empty':
          conditionMet = !fieldValue || fieldValue === '';
          console.log(`Comparison: ${fieldValue} is empty = ${conditionMet}`);
          break;
        case 'is_not_empty':
          conditionMet = fieldValue && fieldValue !== '';
          console.log(`Comparison: ${fieldValue} is not empty = ${conditionMet}`);
          break;
        default:
          console.log(`Unknown operator: ${rule.operator}`);
      }

      if (conditionMet) {
        console.log(`✓ Rule condition MET`);
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
            console.log(`Added to approval levels: Level ${level}, Group: ${group ? group.name : 'Unknown'}`);
          }
        } else if (rule.autoApprove) {
          console.log(`Rule is auto-approve, not adding to approval levels`);
        }
      } else {
        console.log(`✗ Rule condition NOT met`);
      }
    });

    const approvalLevels = Array.from(approvalLevelsMap.values()).sort((a, b) => a.level - b.level);
    const allAutoApprove = triggeredRules.length > 0 && triggeredRules.every(rule => rule.autoApprove);

    console.log('\n=== EVALUATION SUMMARY ===');
    console.log('Triggered rules:', triggeredRules);
    console.log('Approval levels (manual only):', approvalLevels);
    console.log('All auto-approve:', allAutoApprove);
    
    console.log('=== EVALUATE APPROVAL END ===');

    return {
      requiresApproval: approvalLevels.length > 0,
      approvalLevels,
      triggeredRules,
      isAutoApproved: allAutoApprove
    };
  };

  const handleAssignToNextLevel = async () => {
    if (!evaluation || !evaluation.approvalLevels || evaluation.approvalLevels.length === 0) {
      return;
    }

    const currentLevelIndex = evaluation.approvalLevels.findIndex(
      level => level.groupId === String(currentGroup?.id)
    );

    if (currentLevelIndex === -1 || currentLevelIndex >= evaluation.approvalLevels.length - 1) {
      return;
    }

    const nextLevel = evaluation.approvalLevels[currentLevelIndex + 1];

    try {
      await window.zafClient.request({
        url: `/api/v2/tickets/${ticketData['ticket.id']}.json`,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({
          ticket: {
            group_id: nextLevel.groupId,
            comment: {
              body: `Ticket assigned to ${nextLevel.groupName} (Level ${nextLevel.level}) for approval.`,
              public: false
            }
          }
        })
      });

      setCurrentGroup(groups.find(g => g.id === parseInt(nextLevel.groupId)));
      setSuccessMessage(`Ticket assigned to ${nextLevel.groupName} (Level ${nextLevel.level})`);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error assigning ticket:', error);
      setError(`Failed to assign ticket: ${JSON.stringify(error)}`);
    }
  };

  const handleApprove = async () => {
    if (!evaluation || !evaluation.approvalLevels) return;

    const currentLevelIndex = evaluation.approvalLevels.findIndex(
      level => level.groupId === String(currentGroup?.id)
    );

    const isLastLevel = currentLevelIndex === evaluation.approvalLevels.length - 1;

    try {
      console.log('=== HANDLE APPROVE START ===');

      if (isLastLevel) {
        console.log('Final approval - setting status to approved');
        console.log('Approved status ID:', customStatusIdsRef.current.approved);

        const updateData = {
          ticket: {
            custom_status_id: customStatusIdsRef.current.approved,
            comment: {
              body: `Final approval granted by ${currentUser.name}. All required approvals complete.`,
              public: false
            }
          }
        };

        console.log('Update data:', updateData);

        const response = await window.zafClient.request({
          url: `/api/v2/tickets/${ticketData['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(updateData)
        });

        console.log('Final approval response:', response);

        setCurrentCustomStatusId(customStatusIdsRef.current.approved);
        setCanApprove(false);
        setSuccessMessage('Final approval granted. All required approvals complete.');
      } else {
        const nextLevel = evaluation.approvalLevels[currentLevelIndex + 1];

        await window.zafClient.request({
          url: `/api/v2/tickets/${ticketData['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              group_id: nextLevel.groupId,
              custom_status_id: customStatusIdsRef.current.pending_approval,
              comment: {
                body: `Approved by ${currentUser.name}. Ticket assigned to ${nextLevel.groupName} (Level ${nextLevel.level}) for next approval.`,
                public: false
              }
            }
          })
        });

        setCurrentGroup(groups.find(g => g.id === parseInt(nextLevel.groupId)));
        setCurrentCustomStatusId(customStatusIdsRef.current.pending_approval);
        setSuccessMessage(`Approved and assigned to ${nextLevel.groupName} (Level ${nextLevel.level})`);
      }

      console.log('=== HANDLE APPROVE END ===');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error approving:', error);
      setError(`Failed to approve: ${JSON.stringify(error)}`);
    }
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) {
      return;
    }

    try {
      await window.zafClient.request({
        url: `/api/v2/tickets/${ticketData['ticket.id']}.json`,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({
          ticket: {
            assignee_id: originalRequester.id,
            group_id: null,
            custom_status_id: customStatusIdsRef.current.declined,
            comment: {
              body: `Request declined by ${currentUser.name}.\n\nReason: ${declineReason}`,
              public: false
            }
          }
        })
      });

      setCurrentGroup(null);
      setCurrentCustomStatusId(customStatusIdsRef.current.declined);
      setShowDeclineModal(false);
      setDeclineReason('');
      setSuccessMessage('Request declined and assigned directly to requester');
      setTimeout(() => setSuccessMessage(''), 5000);
      console.log('Ticket declined and assigned to user:', originalRequester.id);
    } catch (error) {
      console.error('Error declining:', error);
      setError(`Failed to decline: ${JSON.stringify(error)}`);
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

  const currentLevelIndex = evaluation.approvalLevels.findIndex(
    level => level.groupId === String(currentGroup?.id)
  );
  const currentLevel = currentLevelIndex >= 0 ? evaluation.approvalLevels[currentLevelIndex] : null;
  const nextLevel = currentLevelIndex >= 0 && currentLevelIndex < evaluation.approvalLevels.length - 1
    ? evaluation.approvalLevels[currentLevelIndex + 1]
    : null;

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
      ) : evaluation.requiresApproval ? (
        <Alert type="warning">Approval Required</Alert>
      ) : (
        <Alert type="success">No Approval Required</Alert>
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
            <StatusBadge status={isFullyApproved ? 'approved' : isDeclined ? 'declined' : evaluation.requiresApproval ? 'pending' : 'approved'}>
              {isFullyApproved ? 'FULLY APPROVED' : isDeclined ? 'DECLINED' : evaluation.requiresApproval ? 'REQUIRES APPROVAL' : 'NO APPROVAL NEEDED'}
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
              const isPending = currentLevelIndex < index;

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
                  <>⚠ {rule.ruleName} - Requires Level {rule.approvalLevel} approval</>
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
                onClick={handleApprove}
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
              onClick={handleDecline}
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