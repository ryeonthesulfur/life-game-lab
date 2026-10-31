import { useState } from 'react'
import { useDialog } from './components/Dialog'
import { useToast } from './components/Toast'
import type { Experiment } from './db/experiments'
import { ExperimentScreen } from './screens/ExperimentScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { useLab } from './useLab'

type Tab = 'experiment' | 'records'

export default function App() {
  const [tab, setTab] = useState<Tab>('experiment')
  const [dialog, ask] = useDialog()
  const [toast, showToast] = useToast()
  const lab = useLab(ask, showToast)

  const openRecords = async () => {
    if (tab === 'records') return
    lab.setRunning(false)
    if (lab.isInExperiment()) {
      const res = await ask({
        message: 'この実験を記録しますか？',
        buttons: [
          { label: 'キャンセル', value: 'cancel' },
          { label: '記録せずに移動', value: 'skip' },
          { label: '記録して移動', value: 'save', kind: 'primary' },
        ],
      })
      if (res.value === 'cancel') return
      if (res.value === 'save' && !(await lab.record())) return
    }
    setTab('records')
  }

  const loadFromRecord = (load: (exp: Experiment) => Promise<boolean>) => async (exp: Experiment) => {
    const ok = await load(exp)
    if (ok) setTab('experiment')
    return ok
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>ライフゲーム実験室</h1>
        <nav className="tabs">
          <button className={tab === 'experiment' ? 'active' : ''} onClick={() => setTab('experiment')}>実験画面</button>
          <button className={tab === 'records' ? 'active' : ''} onClick={() => void openRecords()}>記録画面</button>
        </nav>
      </header>

      {/* 記録画面にいる間も実験は消さずに残しておくため、両方とも描画したまま隠す */}
      <main hidden={tab !== 'experiment'}>
        <ExperimentScreen lab={lab} />
      </main>
      <main hidden={tab !== 'records'}>
        <RecordsScreen
          active={tab === 'records'}
          ask={ask}
          showToast={showToast}
          onRestart={loadFromRecord(lab.restartFrom)}
          onContinue={loadFromRecord(lab.continueFrom)}
        />
      </main>

      {dialog}
      {toast}
    </div>
  )
}
