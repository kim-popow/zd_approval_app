import React, { useState, useEffect } from 'react';
import { ThemeProvider, DEFAULT_THEME } from '@zendeskgarden/react-theming';
import { Tabs, TabList, Tab, TabPanel } from '@zendeskgarden/react-tabs';
import { ApprovalEvaluator } from './components/ApprovalEvaluator';
import { RuleManager } from './components/RuleManager';

const queryParams = new URLSearchParams(location.search);
const initialColorScheme = queryParams.get('colorScheme') || 'light';

const App = () => {
  const [base, setBase] = useState(initialColorScheme);
  const [ticketFormName, setTicketFormName] = useState(null);
  const [ticketFields, setTicketFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('evaluator');
  const [rules, setRules] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Ensure zafClient is available
        if (!window.zafClient) {
          console.error('ZAF Client not available');
          setError('ZAF Client not initialized');
          setLoading(false);
          return;
        }
        
        await window.zafClient.invoke('resize', { width: '100%', height: '600px' });
        
        const colorSchemeData = await window.zafClient.get('colorScheme');
        setBase(colorSchemeData.colorScheme);
        
        window.zafClient.on('colorScheme.changed', colorScheme => setBase(colorScheme));
        
        const data = await window.zafClient.get(['ticket.form', 'ticketFields']);
        
        let formId = data['ticket.form'];
        console.log('Ticket form ID (raw):', formId, 'Type:', typeof formId);
        console.log('Full form data:', JSON.stringify(formId));
        
        // Handle if formId is an object with an id property
        if (formId && typeof formId === 'object') {
          if (formId.id) {
            formId = formId.id;
            console.log('Extracted form ID from object:', formId);
          } else {
            console.error('Form ID object does not have an id property:', formId);
            setError('Invalid form data structure: ' + JSON.stringify(formId));
            setLoading(false);
            return;
          }
        }
        
        // Convert to number if it's a string
        if (typeof formId === 'string') {
          formId = parseInt(formId, 10);
          console.log('Converted form ID to number:', formId);
        }
        
        if (formId && !isNaN(formId) && formId > 0) {
          try {
            const formResponse = await window.zafClient.request({
              url: `/api/v2/ticket_forms/${formId}.json`,
              type: 'GET'
            });
            
            console.log('Ticket form details:', formResponse);
            
            if (formResponse && formResponse.ticket_form && formResponse.ticket_form.name) {
              setTicketFormName(formResponse.ticket_form.name);
            }
          } catch (formError) {
            console.error('Error fetching form details:', formError);
            setError('Unable to fetch ticket form details. Form ID: ' + formId + '. Error: ' + JSON.stringify(formError));
          }
        } else {
          console.warn('Invalid or missing form ID:', formId);
          setError('No valid ticket form found. Form ID received: ' + JSON.stringify(data['ticket.form']));
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
        <div style={{ padding: '16px', fontSize: '12px', color: '#888' }}>
          This app only appears for Credit Memo tickets.
          {ticketFormName && (
            <div style={{ marginTop: '8px' }}>
              Current form: {ticketFormName}
            </div>
          )}
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
          <ApprovalEvaluator />
        </TabPanel>
        <TabPanel item="rules">
          <RuleManager />
        </TabPanel>
      </Tabs>
    </ThemeProvider>
  );
};

export default App;