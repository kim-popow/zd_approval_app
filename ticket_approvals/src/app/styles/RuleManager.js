import styled from 'styled-components';

export const RuleManagerContainer = styled.div`
  padding: 16px;
  width: 100%;
`;

export const RuleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const RuleCard = styled.div`
  border: 1px solid ${props => props.theme.colors.base === 'dark' ? '#49545c' : '#d8dcde'};
  border-radius: 4px;
  padding: 12px;
  background-color: ${props => props.theme.colors.base === 'dark' ? '#1f2933' : '#fff'};
`;

export const RuleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  color: ${props => props.theme.colors.base === 'dark' ? '#fff' : '#2f3941'};

  span {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    background-color: ${props => props.theme.colors.base === 'dark' ? '#3d4852' : '#e9ebed'};
  }
`;

export const RuleDetails = styled.div`
  font-size: 13px;
  margin-bottom: 12px;
  color: ${props => props.theme.colors.base === 'dark' ? '#d8dcde' : '#49545c'};

  div {
    margin: 4px 0;
  }

  strong {
    margin-right: 4px;
  }
`;

export const RuleActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

export const AddRuleButton = styled.div`
  margin-top: 16px;
  display: flex;
  justify-content: center;
`;

export const FormRow = styled.div`
  margin-bottom: 16px;
`;
