import styled from 'styled-components';

export const EvaluationContainer = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const EvaluationSummary = styled.div`
  padding: 16px;
  background-color: ${props => props.theme.palette.grey[100]};
  border-radius: 4px;
  
  h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: ${props => props.theme.palette.grey[800]};
  }
  
  div {
    margin-bottom: 8px;
    font-size: 14px;
    color: ${props => props.theme.palette.grey[700]};
    
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

export const CriteriaList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const CriteriaItem = styled.li`
  padding: 12px;
  border-radius: 4px;
  background-color: ${props => {
    if (props.status === 'passed') return '#e9f5e9';
    if (props.status === 'flagged') return '#fff4e5';
    if (props.status === 'info') return '#e3f2fd';
    return '#f5f5f5';
  }};
  border-left: 4px solid ${props => {
    if (props.status === 'passed') return '#4caf50';
    if (props.status === 'flagged') return '#ff9800';
    if (props.status === 'info') return '#2196f3';
    return '#9e9e9e';
  }};
  font-size: 14px;
  color: ${props => props.theme.palette.grey[800]};
`;

export const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${props => {
    if (props.status === 'approved') return '#4caf50';
    if (props.status === 'declined') return '#d32f2f';
    if (props.status === 'requires_approval') return '#ff9800';
    return '#9e9e9e';
  }};
  color: white;
`;

export const WorkflowTracker = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
`;

export const LevelBadge = styled.div`
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  background-color: ${props => {
    if (props.status === 'completed') return '#2e7d32';
    if (props.status === 'current') return '#f57c00';
    if (props.status === 'pending') return '#1976d2';
    return '#9e9e9e';
  }};
  color: white;
  border-left: 4px solid ${props => {
    if (props.status === 'completed') return '#1b5e20';
    if (props.status === 'current') return '#e65100';
    if (props.status === 'pending') return '#0d47a1';
    return '#616161';
  }};
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;
