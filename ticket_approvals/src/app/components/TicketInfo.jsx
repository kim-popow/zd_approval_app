import React, { useState, useEffect } from 'react';
import { Spinner } from '@zendeskgarden/react-loaders';
import { Grid } from '@zendeskgarden/react-grid';
import { Container, Section, FieldLabel, FieldValue, Title } from '../styles/TicketInfo';

export const TicketInfo = () => {
  const [ticketData, setTicketData] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTicketData = async () => {
      try {
        const data = await window.zafClient.get([
          'ticket.id',
          'ticket.subject',
          'ticket.description',
          'ticket.status',
          'ticket.priority',
          'ticket.requester',
          'ticketFields'
        ]);

        setTicketData(data);

        const fields = data.ticketFields || [];
        const customFieldsList = fields.filter(field => 
          field.name && field.name.startsWith('custom_field_')
        );

        const customFieldsWithValues = await Promise.all(
          customFieldsList.map(async (field) => {
            try {
              const valueData = await window.zafClient.get(`ticket.customField:${field.name}`);
              return {
                ...field,
                value: valueData[`ticket.customField:${field.name}`]
              };
            } catch (err) {
              return {
                ...field,
                value: null
              };
            }
          })
        );

        setCustomFields(customFieldsWithValues);
        setLoading(false);
      } catch (err) {
        setError(JSON.stringify(err));
        setLoading(false);
      }
    };

    fetchTicketData();
  }, []);

  if (loading) {
    return (
      <Container>
        <Spinner />
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div>Error loading ticket data: {error}</div>
      </Container>
    );
  }

  const formatValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return 'Not set';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  return (
    <Container>
      <Section>
        <Title>Ticket Information</Title>
        <Grid>
          <Grid.Row>
            <Grid.Col>
              <FieldLabel>ID</FieldLabel>
              <FieldValue>{ticketData['ticket.id']}</FieldValue>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row>
            <Grid.Col>
              <FieldLabel>Subject</FieldLabel>
              <FieldValue>{ticketData['ticket.subject'] || 'Not set'}</FieldValue>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row>
            <Grid.Col>
              <FieldLabel>Description</FieldLabel>
              <FieldValue>{ticketData['ticket.description'] || 'Not set'}</FieldValue>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row>
            <Grid.Col>
              <FieldLabel>Status</FieldLabel>
              <FieldValue>{ticketData['ticket.status'] || 'Not set'}</FieldValue>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row>
            <Grid.Col>
              <FieldLabel>Priority</FieldLabel>
              <FieldValue>{ticketData['ticket.priority'] || 'Not set'}</FieldValue>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row>
            <Grid.Col>
              <FieldLabel>Requester</FieldLabel>
              <FieldValue>
                {ticketData['ticket.requester']?.name || 'Not set'}
                {ticketData['ticket.requester']?.email && 
                  ` (${ticketData['ticket.requester'].email})`}
              </FieldValue>
            </Grid.Col>
          </Grid.Row>
        </Grid>
      </Section>

      {customFields.length > 0 && (
        <Section>
          <Title>Custom Fields</Title>
          <Grid>
            {customFields.map((field, index) => (
              <Grid.Row key={index}>
                <Grid.Col>
                  <FieldLabel>{field.label || field.name}</FieldLabel>
                  <FieldValue>{formatValue(field.value)}</FieldValue>
                </Grid.Col>
              </Grid.Row>
            ))}
          </Grid>
        </Section>
      )}
    </Container>
  );
};