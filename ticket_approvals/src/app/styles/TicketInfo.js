import styled from 'styled-components';

export const Container = styled.div`
  padding: 16px;
  width: 100%;
`;

export const Section = styled.div`
  margin-bottom: 24px;
`;

export const Title = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: ${props => props.theme.colors.base === 'dark' ? '#fff' : '#2f3941'};
`;

export const FieldLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  color: ${props => props.theme.colors.base === 'dark' ? '#adb5bd' : '#68737d'};
`;

export const FieldValue = styled.div`
  font-size: 14px;
  margin-bottom: 12px;
  color: ${props => props.theme.colors.base === 'dark' ? '#d8dcde' : '#2f3941'};
  word-wrap: break-word;
`;
