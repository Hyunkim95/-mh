import { useState } from 'react'
import { Button, useCounter } from '@trpc-template/client'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const { count: hookCount, increment, decrement, reset } = useCounter(0)

  return (
    <>
      <div>
        <h1>Vite + React</h1>
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR!
          </p>
        </div>
        
        <div className="card">
          <h2>Using Client Library</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button variant="secondary" onClick={decrement}>
              -
            </Button>
            <span>Counter: {hookCount}</span>
            <Button variant="primary" onClick={increment}>
              +
            </Button>
            <Button variant="secondary" onClick={reset}>
              Reset
            </Button>
          </div>
        </div>
        
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
      </div>
    </>
  )
}

export default App
