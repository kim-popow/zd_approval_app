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
              comment: {
                body: `Ticket automatically assigned to ${level1.groupName} (Level ${level1.level}) for approval.`,
                public: false
              }
            }
          })
        });

        autoAssignProcessedRef.current = true;
        
        // Refresh the app to show the triggered rules and approve/decline buttons
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

          if (ticketResponse.ticket.custom_status_id === customStatusIdsRef.current.submit_for_approval) {
            if (!autoAssignProcessedRef.current) {
              await autoAssignToLevel1();
              previousStatusRef.current = customStatusIdsRef.current.submit_for_approval;
            }
          }
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
      setGroups(fetchedGroups);

      if (currentGroupId) {
        const group = fetchedGroups.find(g => g.id === currentGroupId);
        setCurrentGroup(group || null);
      }

      const ticketFieldsResponse = await window.zafClient.get('ticketFields');
      const allFields = ticketFieldsResponse.ticketFields || [];
      
      const creditTypeField = allFields.find(field => {
        const fieldLabel = (field.label || field.title || '').toLowerCase();
        return fieldLabel.includes('type') && fieldLabel.includes('credit');
      });
      
      if (creditTypeField) {
        setCreditTypeFieldId(creditTypeField.name);
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

      setTicketData(data);
      setCurrentUser(data.currentUser);
      setOriginalRequester(data['ticket.requester']);

      if (data.currentUser && data.currentUser.groups) {
        const userGroupIds = data.currentUser.groups.map(g => g.id);
        const isInCurrentGroup = currentGroupId && userGroupIds.includes(currentGroupId);
        setCanApprove(isInCurrentGroup);
      }

      const fetchedRules = await fetchRulesFromCustomObject();

      const evaluation = evaluateApproval(data, fetchedRules, fetchedGroups, creditTypeField?.name);
      setEvaluation(evaluation);

      setLoading(false);
    } catch (err) {
      console.error('Error loading ticket data:', err);
      setError(`Failed to load ticket data: ${JSON.stringify(err)}`);
      setLoading(false);
    }
  };

  const evaluateApproval = (data, rules, groups, creditTypeFieldId) => {
    const creditTypeValue = creditTypeFieldId ? data[creditTypeFieldId] : null;

    const triggeredRules = [];
    const approvalLevelsMap = new Map();

    rules.forEach((rule) => {
      if (rule.creditTypeValue && creditTypeValue !== rule.creditTypeValue) {
        return;
      }

      const fieldValue = data[rule.fieldName];

      let conditionMet = false;

      switch (rule.operator) {
        case 'greater_than':
          conditionMet = parseFloat(fieldValue) > parseFloat(rule.value);
          break;
        case 'less_than':
          conditionMet = parseFloat(fieldValue) < parseFloat(rule.value);
          break;
        case 'equal_to':
          conditionMet = String(fieldValue).toLowerCase() === String(rule.value).toLowerCase();
          break;
        case 'not_equal_to':
          conditionMet = String(fieldValue).toLowerCase() !== String(rule.value).toLowerCase();
          break;
        case 'contains':
          conditionMet = String(fieldValue).toLowerCase().includes(String(rule.value).toLowerCase());
          break;
        case 'not_contains':
          conditionMet = !String(fieldValue).toLowerCase().includes(String(rule.value).toLowerCase());
          break;
        case 'is_empty':
          conditionMet = !fieldValue || fieldValue === '';
          break;
        case 'is_not_empty':
          conditionMet = fieldValue && fieldValue !== '';
          break;
        default:
          break;
      }

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

  const handleApprove = async () => {
    if (!evaluation || !evaluation.approvalLevels) return;

    const currentLevelIndex = evaluation.approvalLevels.findIndex(
      level => level.groupId === String(currentGroup?.id)
    );

    const isLastLevel = currentLevelIndex === evaluation.approvalLevels.length - 1;

    try {
      if (isLastLevel) {
        const updateData = {
          ticket: {
            custom_status_id: customStatusIdsRef.current.approved,
            comment: {
              body: `Final approval granted by ${currentUser.name}. All required approvals complete.`,
              public: false
            }
          }
        };

        await window.zafClient.request({
          url: `/api/v2/tickets/${ticketData['ticket.id']}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(updateData)
        });

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