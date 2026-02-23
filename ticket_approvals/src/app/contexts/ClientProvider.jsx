import { useMemo, useState, useEffect, createContext } from 'react'
export const ClientContext = createContext({})

export function ClientProvider({ children }) {
  const client = useMemo(() => {
    if (window.zafClient) {
      return window.zafClient
    }

    if (!window.ZAFClient) {
      return null
    }

    const initializedClient = window.ZAFClient.init()
    window.zafClient = initializedClient
    return initializedClient
  }, [])
  const [appRegistered, setAppRegistered] = useState(false)

  useEffect(() => {
    if (!client) {
      return
    }

    window.zafClient = client
    client.on('app.registered', function () {
      setAppRegistered(true)
    })
  }, [client])

  if (!client || !appRegistered) return null

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
}
