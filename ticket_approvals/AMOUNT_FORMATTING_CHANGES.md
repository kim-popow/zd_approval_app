# Amount Field Formatting Changes

## Overview
This document outlines the changes needed to format the amount field with commas and decimal points (e.g., 3000 → 3,000.00) when creating or editing rules in the RuleManager component.

## Changes Required

### 1. Add Helper Functions for Number Formatting

**Location:** `RuleManager.jsx` - Add after the `approvalLevels` constant (around line 49)

**New Code:**
```javascript
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
```

### 2. Update Value Input Field onChange Handler

**Location:** `RuleManager.jsx` - Lines 507-516 (Value input field)

**Current Code:**
```javascript
<FormRow>
  <Field>
    <Label>Value</Label>
    <Input
      value={formData.value}
      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
      disabled={formData.operator === 'is_empty' || formData.operator === 'is_not_empty'}
    />
  </Field>
</FormRow>
```

**New Code:**
```javascript
<FormRow>
  <Field>
    <Label>Value</Label>
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
          const formatted = formatAmount(formData.value);
          // If the formatted value differs, update to ensure consistency
          if (formatted !== formatAmount(formData.value)) {
            const unformatted = parseAmount(formData.value);
            setFormData({ ...formData, value: unformatted });
          }
        }
      }}
      disabled={formData.operator === 'is_empty' || formData.operator === 'is_not_empty'}
    />
  </Field>
</FormRow>
```

**Note:** The formatting happens in real-time as the user types. The `value` prop displays the formatted version, while `formData.value` stores the unformatted numeric string. The `onBlur` handler ensures the value is properly formatted when the user leaves the field.

### 3. Update handleOpenModal (No Changes Needed)

**Location:** `RuleManager.jsx` - Lines 330-358 (handleOpenModal function)

**Current Code is Fine:**
```javascript
if (rule) {
  setEditingRule(rule);
  setFormData({
    ruleName: rule.ruleName,
    creditTypeValue: rule.creditTypeValue,
    fieldName: rule.fieldName,
    operator: rule.operator,
    value: rule.value, // This stores the raw value from database
    autoApprove: rule.autoApprove || false,
    approvalLevel: rule.approvalLevel,
    groupId: rule.groupId
  });
}
```

**Note:** No changes needed here. The `rule.value` from the database is stored as-is in `formData.value`. The formatting for display is handled automatically by the Input's `value` prop which calls `formatAmount()` when the field is numeric.

### 4. No Additional useEffect Needed

**Note:** The formatting is handled dynamically in the Input's `value` prop, so no additional useEffect is required. When the user changes the field selection, the Input will automatically format or unformat the value based on the new field type.

### 5. Ensure Value is Saved in Unformatted Format

**Location:** `RuleManager.jsx` - Lines 365-372 (handleSaveRule function)

**Current Code:**
```javascript
const handleSaveRule = async () => {
  const rule = {
    ...formData,
    id: editingRule?.id
  };
  await saveRule(rule);
  handleCloseModal();
};
```

**New Code:**
```javascript
const handleSaveRule = async () => {
  // Ensure value is unformatted before saving
  const field = ticketFields.find(f => f.name === formData.fieldName);
  const isNumeric = field && (field.type === 'decimal' || field.type === 'integer');
  
  const rule = {
    ...formData,
    // formData.value should already be unformatted, but ensure it is
    value: isNumeric ? parseAmount(formData.value) : formData.value,
    id: editingRule?.id
  };
  await saveRule(rule);
  handleCloseModal();
};
```

## Summary of Changes

1. **Add three helper functions (around line 49):**
   - `formatAmount()` - Formats numbers with commas and 2 decimal places (e.g., 3000 → "3,000.00")
   - `parseAmount()` - Converts formatted string back to numeric string (e.g., "3,000.00" → "3000")
   - `isNumericField()` - Checks if selected field is numeric type (decimal or integer)

2. **Update Value Input field (lines 507-516):**
   - Display formatted value for numeric fields in the `value` prop
   - Store unformatted value in `formData.value` for saving
   - Handle `onChange` to parse and store unformatted value
   - Add `onBlur` handler to ensure proper formatting when field loses focus

3. **Update handleSaveRule (lines 365-372):**
   - Ensure unformatted value is saved to database (formData.value should already be unformatted)

4. **No changes needed to handleOpenModal:**
   - The Input's value prop automatically handles formatting when editing existing rules

## Testing Considerations

- Test entering: 3000 → should display as 3,000.00
- Test entering: 3000.5 → should display as 3,000.50
- Test entering: 1234567.89 → should display as 1,234,567.89
- Test with non-numeric fields (should not format)
- Test saving and reloading rules (should maintain formatting)
- Test switching between numeric and non-numeric fields
- Test edge cases: empty input, just decimal point, invalid characters

