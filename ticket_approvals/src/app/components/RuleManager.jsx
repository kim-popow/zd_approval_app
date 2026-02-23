import { useState, useEffect } from 'react';
import { Button } from '@zendeskgarden/react-buttons';
import { Field, Label, Input, Checkbox } from '@zendeskgarden/react-forms';
import { Combobox, Field as DropdownField, Item } from '@zendeskgarden/react-dropdowns';
import { Modal, Header, Body, Footer, Close } from '@zendeskgarden/react-modals';
import { Alert } from '@zendeskgarden/react-notifications';
import { RuleList, RuleCard, RuleHeader, RuleDetails, RuleActions, FormRow } from '../styles/RuleManager';

export const RuleManager = () => {
  const [rules, setRules] = useState([]);
  const [groups, setGroups] = useState([]);
  const [ticketFields, setTicketFields] = useState([]);
  const [creditTypeOptions, setCreditTypeOptions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  const [formData, setFormData] = useState({
    ruleName: '',
    creditTypeValue: '',
    fieldName: '',
    operator: 'greater_than',
    value: '',
    fieldName2: '',
    operator2: 'greater_than',
    value2: '',
    autoApprove: false,
    approvalLevel: '1',
    groupId: ''
  });

  const operators = [
    { value: 'greater_than', label: 'Greater than' },
    { value: 'less_than', label: 'Less than' },
    { value: 'equal_to', label: 'Equal to' },
    { value: 'not_equal_to', label: 'Not equal to' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does not contain' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' }
  ];

  const approvalLevels = [
    { value: '1', label: 'Level 1' },
    { value: '2', label: 'Level 2' },
    { value: '3', label: 'Level 3' },
    { value: '4', label: 'Level 4' },
    { value: '5', label: 'Level 5' }
  ];

  // Helper function to format number with commas and 2 decimal places
  const formatAmount = (value) => {
    if (!value || value === '') return '';
    
    // Remove all non-numeric characters except decimal point
    const numericValue = value.toString().replace(/[^\d.]/g, '');
    
    // Handle empty or invalid input
    if (!numericValue || numericValue === '.') return '';
    
    // Parse to number
    const num = parseFloat(numericValue);
    
    // Check if valid number
    if (isNaN(num)) return '';
    
    // Format with commas and 2 decimal places
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Helper function to parse formatted string back to number string
  const parseAmount = (formattedValue) => {
    if (!formattedValue || formattedValue === '') return '';
    
    // Remove all non-numeric characters except decimal point
    const numericValue = formattedValue.toString().replace(/[^\d.]/g, '');
    
    // Handle empty or just decimal point
    if (!numericValue || numericValue === '.') return '';
    
    // Parse to number to validate
    const num = parseFloat(numericValue);
    
    // Return empty if invalid, otherwise return the numeric string
    if (isNaN(num)) return '';
    
    return num.toString();
  };

  // Helper function to check if selected field is a numeric type
  const isNumericField = (fieldName) => {
    if (!fieldName) return false;
    const field = ticketFields.find(f => f.name === fieldName);
    return field && (field.type === 'decimal' || field.type === 'integer');
  };

  const getPreferredFieldName = (patterns, excluded = []) => {
    const matchesAllWords = (text, words) => words.every(word => text.includes(word));

    for (const field of ticketFields) {
      if (excluded.includes(field.name)) continue;
      const label = String(field.label || '').toLowerCase();
      const name = String(field.name || '').toLowerCase();

      for (const pattern of patterns) {
        const words = pattern.toLowerCase().split(' ').filter(Boolean);
        if (matchesAllWords(label, words) || matchesAllWords(name, words)) {
          return field.name;
        }
      }
    }

    return '';
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        await loadRules();
        await loadGroups();
        await loadTicketFields();
      } catch (err) {
        console.error('Error in initializeData:', err);
      }
    };
    initializeData();
  }, []);

  const loadGroups = async () => {
    try {
      const response = await window.zafClient.request('/api/v2/groups.json');
      setGroups(response.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  const loadTicketFields = async () => {
    try {
      const fieldsData = await window.zafClient.get('ticketFields');
      const fields = fieldsData.ticketFields || [];
      
      console.log('Searching for "Type of Credit" field...');
      
      // Search for "Type of Credit" field - check both title and label properties
      let creditTypeFieldObj = null;
      
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const fieldLabel = (f.label || f.title || '').toLowerCase();
        const hasType = fieldLabel.includes('type');
        const hasCredit = fieldLabel.includes('credit');
        
        console.log(`Checking field: "${f.label || f.title}" - hasType:${hasType}, hasCredit:${hasCredit}`);
        
        if (hasType && hasCredit) {
          creditTypeFieldObj = f;
          console.log('✓ Type of Credit field found:', creditTypeFieldObj);
          break;
        }
      }
      
      if (creditTypeFieldObj) {
        let options = [];
        
        // Check all possible option locations
        if (creditTypeFieldObj.custom_field_options) {
          options = creditTypeFieldObj.custom_field_options.map(opt => ({
            value: opt.value,
            label: opt.name
          }));
          console.log('✓ Found options in custom_field_options:', options);
        } else if (creditTypeFieldObj.system_field_options) {
          options = creditTypeFieldObj.system_field_options.map(opt => ({
            value: opt.value,
            label: opt.name
          }));
          console.log('✓ Found options in system_field_options:', options);
        } else if (creditTypeFieldObj.options) {
          options = creditTypeFieldObj.options.map(opt => ({
            value: opt.value || opt.id,
            label: opt.name || opt.label || opt.value
          }));
          console.log('✓ Found options in options:', options);
        }
        
        if (options.length > 0) {
          console.log('✓ Type of Credit options set:', options);
          setCreditTypeOptions(options);
        } else {
          console.log('⚠ No options found in field object. Trying API...');
          if (creditTypeFieldObj.id) {
            try {
              const fieldResponse = await window.zafClient.request({
                url: `/api/v2/ticket_fields/${creditTypeFieldObj.id}.json`,
                type: 'GET'
              });
              
              console.log('API response for field:', fieldResponse);
              
              if (fieldResponse.ticket_field && fieldResponse.ticket_field.custom_field_options) {
                options = fieldResponse.ticket_field.custom_field_options.map(opt => ({
                  value: opt.value,
                  label: opt.name
                }));
                console.log('✓ Type of Credit options from API:', options);
                setCreditTypeOptions(options);
              }
            } catch (apiErr) {
              console.error('API request failed:', apiErr);
            }
          }
        }
      } else {
        console.error('❌ Type of Credit field NOT FOUND');
        console.log('Available field labels:', fields.map(f => f.label || f.title));
      }
      
      // Set up other ticket fields
      const standardFields = [
        { name: 'ticket.priority', label: 'Priority' },
        { name: 'ticket.status', label: 'Status' },
        { name: 'ticket.requester.email', label: 'Requester Email' }
      ];
      
      const customFields = fields
        .filter(f => 
          f.type === 'text' || 
          f.type === 'textarea' || 
          f.type === 'decimal' || 
          f.type === 'integer' ||
          f.type === 'tagger' ||
          f.type === 'multiselect'
        )
        .map(f => ({
          name: f.name,
          label: f.label || f.name,
          type: f.type
        }));
      
      setTicketFields([...standardFields, ...customFields]);
    } catch (err) {
      console.error('Error in loadTicketFields:', err);
    }
  };

  const ensureCustomObject = async () => {
    try {
      await window.zafClient.request('/api/v2/custom_objects/credit_memo_approval_rules');
    } catch (err) {
      if (err.status === 404) {
        await window.zafClient.request({
          url: '/api/v2/custom_objects',
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            custom_object: {
              key: 'credit_memo_approval_rules',
              title: 'Credit Memo Approval Rules',
              title_pluralized: 'Credit Memo Approval Rules',
              description: 'Stores approval rules for credit memo requests'
            }
          })
        });
      }
    }
  };

  const ensureFieldsExist = async () => {
    try {
      const response = await window.zafClient.request('/api/v2/custom_objects/credit_memo_approval_rules/fields');
      const existingFields = response.custom_object_fields || [];
      const existingFieldKeys = existingFields.map(f => f.key);
      
      const requiredFields = [
        { key: 'rule_name', title: 'Rule Name', type: 'text' },
        { key: 'credit_type_value', title: 'Credit Type Value', type: 'text' },
        { key: 'field_name', title: 'Field Name', type: 'text' },
        { key: 'operator', title: 'Operator', type: 'text' },
        { key: 'value', title: 'Value', type: 'text' },
        { key: 'field_name_2', title: 'Field Name 2', type: 'text' },
        { key: 'operator_2', title: 'Operator 2', type: 'text' },
        { key: 'value_2', title: 'Value 2', type: 'text' },
        { key: 'approval_level', title: 'Approval Level', type: 'text' },
        { key: 'group_id', title: 'Group ID', type: 'text' },
        { key: 'auto_approve', title: 'Auto Approve', type: 'checkbox' }
      ];
      
      const missingFields = requiredFields.filter(f => !existingFieldKeys.includes(f.key));
      
      if (missingFields.length > 0) {
        for (const field of missingFields) {
          await window.zafClient.request({
            url: '/api/v2/custom_objects/credit_memo_approval_rules/fields',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
              custom_object_field: field
            })
          });
        }
      }
    } catch (err) {
      console.error('Error ensuring fields exist:', err);
    }
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      await ensureCustomObject();
      await ensureFieldsExist();
      
      const response = await window.zafClient.request('/api/v2/custom_objects/credit_memo_approval_rules/records');
      const records = response.custom_object_records || [];
      
      const loadedRules = records.map(record => ({
        id: record.id,
        ruleName: record.custom_object_fields.rule_name || '',
        creditTypeValue: record.custom_object_fields.credit_type_value || '',
        fieldName: record.custom_object_fields.field_name || '',
        operator: record.custom_object_fields.operator || 'greater_than',
        value: record.custom_object_fields.value || '',
        fieldName2: record.custom_object_fields.field_name_2 || '',
        operator2: record.custom_object_fields.operator_2 || 'greater_than',
        value2: record.custom_object_fields.value_2 || '',
        approvalLevel: record.custom_object_fields.approval_level || '1',
        groupId: record.custom_object_fields.group_id || '',
        autoApprove: record.custom_object_fields.auto_approve === 'true' || record.custom_object_fields.auto_approve === true
      }));
      
      setRules(loadedRules);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load rules:', err);
      setError('Failed to load rules: ' + JSON.stringify(err));
      setLoading(false);
    }
  };

  const saveRule = async (rule) => {
    try {
      const recordData = {
        custom_object_record: {
          name: rule.ruleName,
          custom_object_fields: {
            rule_name: rule.ruleName,
            credit_type_value: rule.creditTypeValue,
            field_name: rule.fieldName,
            operator: rule.operator,
            value: rule.value,
            field_name_2: rule.fieldName2,
            operator_2: rule.operator2,
            value_2: rule.value2,
            approval_level: rule.autoApprove ? '' : String(rule.approvalLevel),
            group_id: rule.autoApprove ? '' : String(rule.groupId),
            auto_approve: String(rule.autoApprove)
          }
        }
      };

      if (rule.id) {
        await window.zafClient.request({
          url: `/api/v2/custom_objects/credit_memo_approval_rules/records/${rule.id}`,
          type: 'PATCH',
          contentType: 'application/json',
          data: JSON.stringify(recordData)
        });
      } else {
        await window.zafClient.request({
          url: '/api/v2/custom_objects/credit_memo_approval_rules/records',
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(recordData)
        });
      }

      await loadRules();
      setSuccessMessage('Rule saved successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save rule:', err);
      setError('Failed to save rules: ' + JSON.stringify(err));
    }
  };

  const deleteRule = async (ruleId) => {
    try {
      await window.zafClient.request({
        url: `/api/v2/custom_objects/credit_memo_approval_rules/records/${ruleId}`,
        type: 'DELETE'
      });
      await loadRules();
      setSuccessMessage('Rule deleted successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to delete rule:', err);
      setError('Failed to delete rule: ' + JSON.stringify(err));
    }
  };

  const handleOpenModal = (rule = null) => {
    console.log('Opening modal. Type of Credit options:', creditTypeOptions);
    if (rule) {
      setEditingRule(rule);
      setFormData({
        ruleName: rule.ruleName,
        creditTypeValue: rule.creditTypeValue,
        fieldName: rule.fieldName,
        operator: rule.operator,
        value: rule.value,
        fieldName2: rule.fieldName2,
        operator2: rule.operator2,
        value2: rule.value2,
        autoApprove: rule.autoApprove || false,
        approvalLevel: rule.approvalLevel,
        groupId: rule.groupId
      });
    } else {
      const defaultAmountField = getPreferredFieldName(['credit amount', 'amount']);
      const defaultTripChargeField = getPreferredFieldName(['trip charge', 'trip'], defaultAmountField ? [defaultAmountField] : []);

      setEditingRule(null);
      setFormData({
        ruleName: '',
        creditTypeValue: '',
        fieldName: defaultAmountField,
        operator: 'greater_than',
        value: '',
        fieldName2: defaultTripChargeField,
        operator2: 'greater_than',
        value2: '',
        autoApprove: false,
        approvalLevel: '1',
        groupId: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRule(null);
  };

  const handleSaveRule = async () => {
    const requiresValue = (operator) => operator !== 'is_empty' && operator !== 'is_not_empty';

    if (!formData.ruleName.trim()) {
      setError('Rule name is required');
      return;
    }
    if (!formData.creditTypeValue) {
      setError('Type of Credit is required');
      return;
    }
    if (!formData.fieldName || !formData.fieldName2) {
      setError('Both additional checks are required');
      return;
    }
    if (requiresValue(formData.operator) && !String(formData.value).trim()) {
      setError('Value is required for Additional Check 1');
      return;
    }
    if (requiresValue(formData.operator2) && !String(formData.value2).trim()) {
      setError('Value is required for Additional Check 2');
      return;
    }
    if (!formData.autoApprove && (!formData.approvalLevel || !formData.groupId)) {
      setError('Approval level and group are required when auto-approve is off');
      return;
    }

    setError(null);

    // Ensure values are unformatted before saving
    const field = ticketFields.find(f => f.name === formData.fieldName);
    const field2 = ticketFields.find(f => f.name === formData.fieldName2);
    const isNumeric = field && (field.type === 'decimal' || field.type === 'integer');
    const isNumeric2 = field2 && (field2.type === 'decimal' || field2.type === 'integer');
    
    const rule = {
      ...formData,
      value: isNumeric ? parseAmount(formData.value) : formData.value,
      value2: isNumeric2 ? parseAmount(formData.value2) : formData.value2,
      id: editingRule?.id
    };
    await saveRule(rule);
    handleCloseModal();
  };

  const getFieldLabel = (fieldName) => {
    const field = ticketFields.find(f => f.name === fieldName);
    return field ? field.label : fieldName;
  };

  const getOperatorLabel = (operator) => {
    const op = operators.find(o => o.value === operator);
    return op ? op.label : operator;
  };

  const getGroupName = (groupId) => {
    const group = groups.find(g => g.id === parseInt(groupId));
    return group ? group.name : `Group ${groupId}`;
  };

  const getCreditTypeLabel = (value) => {
    const option = creditTypeOptions.find(opt => opt.value === value);
    return option ? option.label : value;
  };

  if (loading) {
    return <div>Loading rules...</div>;
  }

  return (
    <div>
      {error && <Alert type="error">{error}</Alert>}
      {successMessage && <Alert type="success">{successMessage}</Alert>}
      
      <Button onClick={() => handleOpenModal()} isPrimary style={{ marginBottom: '16px' }}>
        Add New Rule
      </Button>

      <RuleList>
        {rules.map(rule => (
          <RuleCard key={rule.id}>
            <RuleHeader>
              <strong>{rule.ruleName}</strong>
              {rule.autoApprove && <span style={{ marginLeft: '8px', color: '#1f73b7', fontSize: '12px' }}>(Auto-Approve)</span>}
            </RuleHeader>
            <RuleDetails>
              <div><strong>Type of Credit:</strong> {getCreditTypeLabel(rule.creditTypeValue)}</div>
              <div><strong>Check 1:</strong> {getFieldLabel(rule.fieldName)} {getOperatorLabel(rule.operator)} {rule.value}</div>
              <div><strong>Check 2:</strong> {getFieldLabel(rule.fieldName2)} {getOperatorLabel(rule.operator2)} {rule.value2}</div>
              {rule.autoApprove ? (
                <div><strong>Action:</strong> Auto-Approve</div>
              ) : (
                <>
                  <div><strong>Level:</strong> {rule.approvalLevel}</div>
                  <div><strong>Group:</strong> {getGroupName(rule.groupId)}</div>
                </>
              )}
            </RuleDetails>
            <RuleActions>
              <Button size="small" onClick={() => handleOpenModal(rule)}>Edit</Button>
              <Button size="small" isDanger onClick={() => deleteRule(rule.id)}>Delete</Button>
            </RuleActions>
          </RuleCard>
        ))}
      </RuleList>

      {isModalOpen && (
        <Modal onClose={handleCloseModal}>
          <Header>{editingRule ? 'Edit Rule' : 'Add New Rule'}</Header>
          <Body>
            <FormRow>
              <Field>
                <Label>Rule Name</Label>
                <Input
                  value={formData.ruleName}
                  onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                />
              </Field>
            </FormRow>

            <FormRow>
              <DropdownField>
                <Label>Type of Credit (Required)</Label>
                <Combobox
                  isEditable={false}
                  selectionValue={formData.creditTypeValue}
                  onChange={({ selectionValue }) => {
                    if (selectionValue !== undefined) {
                      setFormData({ ...formData, creditTypeValue: selectionValue });
                    }
                  }}
                >
                  {creditTypeOptions.length === 0 && <Item value="" disabled>Loading options...</Item>}
                  {creditTypeOptions.map(option => (
                    <Item key={option.value} value={option.value}>{option.label}</Item>
                  ))}
                </Combobox>
              </DropdownField>
            </FormRow>

            <FormRow>
              <DropdownField>
                <Label>Additional Field to Evaluate</Label>
                <Combobox
                  isEditable={false}
                  selectionValue={formData.fieldName}
                  onChange={({ selectionValue }) => {
                    if (selectionValue !== undefined) {
                      setFormData({ ...formData, fieldName: selectionValue });
                    }
                  }}
                >
                  {ticketFields.map(field => (
                    <Item key={field.name} value={field.name}>{field.label}</Item>
                  ))}
                </Combobox>
              </DropdownField>
            </FormRow>

            <FormRow>
              <DropdownField>
                <Label>Operator (Check 1)</Label>
                <Combobox
                  isEditable={false}
                  selectionValue={formData.operator}
                  onChange={({ selectionValue }) => {
                    if (selectionValue !== undefined) {
                      setFormData({ ...formData, operator: selectionValue });
                    }
                  }}
                >
                  {operators.map(op => (
                    <Item key={op.value} value={op.value}>{op.label}</Item>
                  ))}
                </Combobox>
              </DropdownField>
            </FormRow>

            <FormRow>
              <Field>
                <Label>Value (Check 1)</Label>
                <Input
                  value={isNumericField(formData.fieldName) 
                    ? formatAmount(formData.value) 
                    : formData.value}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    if (isNumericField(formData.fieldName)) {
                      // For numeric fields, parse the input and store unformatted value
                      // The formatted display is handled by the value prop above
                      const unformatted = parseAmount(inputValue);
                      setFormData({ ...formData, value: unformatted });
                    } else {
                      // For non-numeric fields, store as-is
                      setFormData({ ...formData, value: inputValue });
                    }
                  }}
                  onBlur={(e) => {
                    // Ensure proper formatting when field loses focus
                    if (isNumericField(formData.fieldName) && formData.value) {
                      // Re-parse to ensure value is clean and properly formatted
                      const unformatted = parseAmount(formData.value);
                      if (unformatted !== formData.value) {
                        setFormData({ ...formData, value: unformatted });
                      }
                    }
                  }}
                  disabled={formData.operator === 'is_empty' || formData.operator === 'is_not_empty'}
                />
              </Field>
            </FormRow>

            <FormRow>
              <DropdownField>
                <Label>Additional Field to Evaluate (Check 2)</Label>
                <Combobox
                  isEditable={false}
                  selectionValue={formData.fieldName2}
                  onChange={({ selectionValue }) => {
                    if (selectionValue !== undefined) {
                      setFormData({ ...formData, fieldName2: selectionValue });
                    }
                  }}
                >
                  {ticketFields.map(field => (
                    <Item key={`${field.name}_2`} value={field.name}>{field.label}</Item>
                  ))}
                </Combobox>
              </DropdownField>
            </FormRow>

            <FormRow>
              <DropdownField>
                <Label>Operator (Check 2)</Label>
                <Combobox
                  isEditable={false}
                  selectionValue={formData.operator2}
                  onChange={({ selectionValue }) => {
                    if (selectionValue !== undefined) {
                      setFormData({ ...formData, operator2: selectionValue });
                    }
                  }}
                >
                  {operators.map(op => (
                    <Item key={`${op.value}_2`} value={op.value}>{op.label}</Item>
                  ))}
                </Combobox>
              </DropdownField>
            </FormRow>

            <FormRow>
              <Field>
                <Label>Value (Check 2)</Label>
                <Input
                  value={isNumericField(formData.fieldName2)
                    ? formatAmount(formData.value2)
                    : formData.value2}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    if (isNumericField(formData.fieldName2)) {
                      const unformatted = parseAmount(inputValue);
                      setFormData({ ...formData, value2: unformatted });
                    } else {
                      setFormData({ ...formData, value2: inputValue });
                    }
                  }}
                  onBlur={() => {
                    if (isNumericField(formData.fieldName2) && formData.value2) {
                      const unformatted = parseAmount(formData.value2);
                      if (unformatted !== formData.value2) {
                        setFormData({ ...formData, value2: unformatted });
                      }
                    }
                  }}
                  disabled={formData.operator2 === 'is_empty' || formData.operator2 === 'is_not_empty'}
                />
              </Field>
            </FormRow>

            <FormRow>
              <Field>
                <Checkbox
                  checked={formData.autoApprove}
                  onChange={(e) => setFormData({ ...formData, autoApprove: e.target.checked })}
                >
                  <Label>Auto-Approve (automatically approve when this rule is met)</Label>
                </Checkbox>
              </Field>
            </FormRow>

            {!formData.autoApprove && (
              <>
                <FormRow>
                  <DropdownField>
                    <Label>Approval Level</Label>
                    <Combobox
                      isEditable={false}
                      selectionValue={formData.approvalLevel}
                      onChange={({ selectionValue }) => {
                        if (selectionValue !== undefined) {
                          setFormData({ ...formData, approvalLevel: selectionValue });
                        }
                      }}
                    >
                      {approvalLevels.map(level => (
                        <Item key={level.value} value={level.value}>{level.label}</Item>
                      ))}
                    </Combobox>
                  </DropdownField>
                </FormRow>

                <FormRow>
                  <DropdownField>
                    <Label>Assign to Group</Label>
                    <Combobox
                      isEditable={false}
                      selectionValue={formData.groupId}
                      onChange={({ selectionValue }) => {
                        if (selectionValue !== undefined) {
                          setFormData({ ...formData, groupId: selectionValue });
                        }
                      }}
                    >
                      {groups.map(group => (
                        <Item key={group.id} value={String(group.id)}>{group.name}</Item>
                      ))}
                    </Combobox>
                  </DropdownField>
                </FormRow>
              </>
            )}
          </Body>
          <Footer>
            <Button onClick={handleCloseModal}>Cancel</Button>
            <Button isPrimary onClick={handleSaveRule}>Save Rule</Button>
          </Footer>
          <Close aria-label="Close modal" />
        </Modal>
      )}
    </div>
  );
};
