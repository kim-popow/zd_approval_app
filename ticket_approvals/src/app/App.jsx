import React, { useState, useEffect } from 'react';
import { ThemeProvider, DEFAULT_THEME } from '@zendeskgarden/react-theming';
import { Tabs, TabList, Tab, TabPanel } from '@zendeskgarden/react-tabs';
import { Button } from '@zendeskgarden/react-buttons';
import { Well } from '@zendeskgarden/react-notifications';
import { ApprovalEvaluator } from './components/ApprovalEvaluator';
import { RuleManager } from './components/RuleManager';

const queryParams = new URLSearchParams(location.search);
const initialColorScheme = queryParams.get('colorScheme') || 'light';

const App = () => {
  const [base, setBase] = useState(initialColorScheme);
  const [ticketFormName, setTicketFormName] = useState(null);
  const [ticketFormId, setTicketFormId] = useState(null);
  const [creditMemoFormId, setCreditMemoFormId] = useState(null);
  const [currentTicketId, setCurrentTicketId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [ticketFields, setTicketFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('evaluator');
  const [rules, setRules] = useState([]);
  const [error, setError] = useState(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await window.zafClient.invoke('resize', { width: '100%', height: '600px' });
        
        const colorSchemeData = await window.zafClient.get('colorScheme');
        setBase(colorSchemeData.colorScheme);
        
        window.zafClient.on('colorScheme.changed', colorScheme => setBase(colorScheme));
        
        const data = await window.zafClient.get(['ticket.form', 'ticket.id', 'currentUser', 'ticketFields']);
        
        setCurrentTicketId(data['ticket.id']);
        setCurrentUserId(data.currentUser.id);
        
        let formId = data['ticket.form'];
        
        if (formId && typeof formId === 'object') {
          if (formId.id) {
            formId = formId.id;
          }
        }
        
        if (typeof formId === 'string') {
          formId = parseInt(formId, 10);
        }
        
        setTicketFormId(formId);
        
        if (formId && !isNaN(formId) && formId > 0) {
          try {
            const formResponse = await window.zafClient.request({
              url: `/api/v2/ticket_forms/${formId}.json`,
              type: 'GET'
            });
            
            if (formResponse && formResponse.ticket_form && formResponse.ticket_form.name) {
              setTicketFormName(formResponse.ticket_form.name);
            }
          } catch (formError) {
            console.error('Error fetching form details:', formError);
            setError('Unable to fetch ticket form details.');
          }
        }
        
        try {
          const formsResponse = await window.zafClient.request({
            url: '/api/v2/ticket_forms.json',
            type: 'GET'
          });
          
          if (formsResponse && formsResponse.ticket_forms) {
            const creditMemoForm = formsResponse.ticket_forms.find(form => {
              const name = form.name.toLowerCase();
              return name.includes('credit') && name.includes('memo');
            });
            
            if (creditMemoForm) {
              setCreditMemoFormId(creditMemoForm.id);
            }
          }
        } catch (formsError) {
          console.error('Error fetching ticket forms:', formsError);
        }
        
        setTicketFields(data.ticketFields || []);
        setLoading(false);
      } catch (error) {
        console.error('Error initializing app:', error);
        setError(JSON.stringify(error));
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  const handleCreateCreditMemo = async () => {
    setCreatingTicket(true);
    setSuccessMessage(null);
    setError(null);

    try {
      const ticketDataResponse = await window.zafClient.request({
        url: `/api/v2/tickets/${currentTicketId}.json`,
        type: 'GET'
      });
      
      const parentTicket = ticketDataResponse.ticket;
      
      const ticketData = await window.zafClient.get(['ticket.organization']);
      const organizationId = ticketData['ticket.organization']?.id;
      
      let accountNumber = null;
      
      if (organizationId) {
        try {
          const orgResponse = await window.zafClient.request({
            url: `/api/v2/organizations/${organizationId}.json`,
            type: 'GET'
          });
          
          if (orgResponse && orgResponse.organization && orgResponse.organization.organization_fields) {
            accountNumber = orgResponse.organization.organization_fields.account_number;
          }
        } catch (orgError) {
          console.error('Error fetching organization:', orgError);
        }
      }

      const ticketFieldsResponse = await window.zafClient.request({
        url: '/api/v2/ticket_fields.json',
        type: 'GET'
      });
      
      const parentTicketField = ticketFieldsResponse.ticket_fields.find(field => {
        const title = (field.title || '').toLowerCase();
        return title.includes('parent') && title.includes('ticket');
      });

      const accountNumberField = ticketFieldsResponse.ticket_fields.find(field => {
        const title = (field.title || '').toLowerCase();
        return title.includes('account') && title.includes('number');
      });

      const productOrderIdsField = ticketFieldsResponse.ticket_fields.find(field => {
        const title = (field.title || '').toLowerCase();
        return title.includes('product') && title.includes('order') && title.includes('id');
      });

      let customFields = [];
      let additionalComment = '';
      
      if (parentTicketField && parentTicketField.id) {
        customFields.push({
          id: parentTicketField.id,
          value: currentTicketId.toString()
        });
      }

      if (accountNumberField && accountNumberField.id && accountNumber) {
        customFields.push({
          id: accountNumberField.id,
          value: accountNumber.toString()
        });
      }

      if (productOrderIdsField && productOrderIdsField.id && parentTicket.custom_fields) {
        const productOrderIdsCustomField = parentTicket.custom_fields.find(cf => cf.id === productOrderIdsField.id);
        
        if (productOrderIdsCustomField && productOrderIdsCustomField.value) {
          const productOrderIds = Array.isArray(productOrderIdsCustomField.value) 
            ? productOrderIdsCustomField.value 
            : [productOrderIdsCustomField.value];
          
          if (productOrderIds.length === 1) {
            customFields.push({
              id: productOrderIdsField.id,
              value: productOrderIds[0]
            });
          } else if (productOrderIds.length > 1) {
            additionalComment = '\n\nNote: The parent ticket has multiple Product Order IDs. Please manually enter the correct Product Order ID value.';
          }
        }
      }

      const ticketPayload = {
        ticket: {
          subject: `Credit Memo for Ticket #${currentTicketId}`,
          comment: {
            body: `Credit memo created from ticket #${currentTicketId}${additionalComment}`,
            public: false
          },
          requester_id: currentUserId,
          ticket_form_id: creditMemoFormId,
          custom_fields: customFields
        }
      };

      const response = await window.zafClient.request({
        url: '/api/v2/tickets.json',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(ticketPayload)
      });

      if (response && response.ticket) {
        const newTicketId = response.ticket.id;
        
        const contextData = await window.zafClient.context();
        const subdomain = contextData.account.subdomain;
        const ticketUrl = `https://${subdomain}.zendesk.com/agent/tickets/${newTicketId}`;
        
        const commentData = {
          ticket: {
            comment: {
              body: `Credit memo ticket [#${newTicketId}](${ticketUrl}) created`,
              public: false,
              html_body: `Credit memo ticket <a href="${ticketUrl}" target="_blank">#${newTicketId}</a> created`
            }
          }
        };

        await window.zafClient.request({
          url: `/api/v2/tickets/${currentTicketId}.json`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(commentData)
        });

        setSuccessMessage(`Credit memo ticket #${newTicketId} created successfully.`);
        
        await window.zafClient.invoke('routeTo', 'ticket', newTicketId);
        
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (error) {
      console.error('Error creating credit memo ticket:', error);
      setError('Failed to create credit memo ticket: ' + JSON.stringify(error));
    } finally {
      setCreatingTicket(false);
    }
  };

  const themeObject = {
    ...DEFAULT_THEME,
    colors: { ...DEFAULT_THEME.colors, base },
  };

  if (loading) {
    return (
      <ThemeProvider theme={themeObject}>
        <div style={{ padding: '16px' }}>Loading...</div>
      </ThemeProvider>
    );
  }

  if (error) {
    return (
      <ThemeProvider theme={themeObject}>
        <div style={{ padding: '16px', color: 'red' }}>
          <strong>Error:</strong> {error}
        </div>
      </ThemeProvider>
    );
  }

  const formName = ticketFormName ? ticketFormName.toLowerCase() : '';
  const isCreditMemo = formName.includes('credit') && formName.includes('memo');

  if (!ticketFormName || !isCreditMemo) {
    return (
      <ThemeProvider theme={themeObject}>
        <div style={{ padding: '16px' }}>
          <Well>
            <div style={{ marginBottom: '12px', fontSize: '14px' }}>
              This app is for Credit Memo tickets.
              {ticketFormName && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
                  Current form: {ticketFormName}
                </div>
              )}
            </div>
            {creditMemoFormId && (
              <>
                {successMessage && (
                  <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px' }}>
                    {successMessage}
                  </div>
                )}
                <Button 
                  onClick={handleCreateCreditMemo} 
                  isPrimary
                  isStretched
                  disabled={creatingTicket}
                >
                  {creatingTicket ? 'Creating...' : 'Create Credit Memo Ticket'}
                </Button>
              </>
            )}
          </Well>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={themeObject}>
      <Tabs selectedItem={selectedTab} onChange={setSelectedTab}>
        <TabList>
          <Tab item="evaluator">Evaluation</Tab>
          <Tab item="rules">Manage Rules</Tab>
        </TabList>
        <TabPanel item="evaluator">
          <ApprovalEvaluator rules={rules} />
        </TabPanel>
        <TabPanel item="rules">
          <RuleManager ticketFields={ticketFields} onRulesChange={setRules} />
        </TabPanel>
      </Tabs>
    </ThemeProvider>
  );
};

export default App;