import React, { useState } from 'react'
import { History as HistoryComponent } from '../components/history'
import { NavBar } from '../components/NavBar'
import { Card } from '../components/Card'
import ReloadIcon from '../../assets/icons/reload-icon.svg'
import { TABS } from '../constants/tab'

export const History: React.FC = () => {
  const [reloadTrigger, setReloadTrigger] = useState(0)

  const handleReloadClick = () => {
    setReloadTrigger((prev) => prev + 1)
  }

  const historyCardBody = <HistoryComponent reloadTrigger={reloadTrigger} />

  return (
    <div className='min-h-screen text-[var(--white-100)] flex flex-col items-center gap-9 w-full relative'>
      <div className='min-h-screen flex w-full fixed'>
        <div className='app-gradient-bg'>
          <div className='ellipse-bg-one' />
          <div className='ellipse-bg-two' />
        </div>
      </div>
      <NavBar />
      <Card
        cardHeader={{
          tabs: TABS,
          activeKey: 'history',
          rightSlot: (
            <div className='h-10 w-10 rounded-lg bg-[var(--light-silver-500-transparency-04)] flex items-center justify-center'>
              <div 
                className='h-4 w-4 rounded-full flex items-center justify-center cursor-pointer'
                onClick={handleReloadClick}
              >
                <img
                  src={ReloadIcon}
                  alt='reload-icon'
                  className='h-full w-full object-contain'
                />
              </div>
            </div>
          ),
        }}
        cardBody={historyCardBody}
      />
    </div>
  )
}