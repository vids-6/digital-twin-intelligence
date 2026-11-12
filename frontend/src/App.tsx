import { useEffect } from 'react';
import { Palette } from './components/Palette';
import { Toasts } from './components/Overlay';
import { SimStrip, StaleBanner, TopBar } from './components/Shell';
import { TitleBlock } from './components/PageHead';
import { LoadingScreen, OfflineScreen, EmptyState } from './components/States';
import { useRoute } from './lib/router';
import { FactoryProvider, useFactory } from './state/factory';
import { SessionProvider } from './state/session';
import { Command } from './pages/Command';
import { Floor } from './pages/Floor';
import { Dependencies } from './pages/Dependencies';
import { Machines } from './pages/Machines';
import { Investigate } from './pages/Investigate';
import { Library } from './pages/Library';
import { Evaluate } from './pages/Evaluate';
import { System } from './pages/System';

function Pages() {
  const { segments } = useRoute();
  const first = segments[0] ?? '';

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [first]);

  switch (first) {
    case '': return <Command />;
    case 'floor': return <Floor />;
    case 'dependencies': return <Dependencies />;
    case 'machines': return <Machines />;
    case 'investigate': return <Investigate />;
    case 'library': return <Library />;
    case 'evaluation': return <Evaluate />;
    case 'system': return <System />;
    default:
      return (
        <EmptyState title="That page does not exist" action={<a className="btn btn-primary" href="#/">Back to Command</a>}>
          There is no sheet at <span className="mono">#/{segments.join('/')}</span>.
        </EmptyState>
      );
  }
}

function Frame() {
  const { link, hasData } = useFactory();
  const { segments } = useRoute();
  const first = segments[0] ?? '';
  const gate = !hasData ? (link === 'offline' ? <OfflineScreen /> : <LoadingScreen />) : null;
  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <SimStrip />
      <TopBar />
      <StaleBanner />
      <main id="main" tabIndex={-1} className="page" key={gate ? 'gate' : first}>
        {gate ?? <Pages />}
      </main>
      <TitleBlock />
      <Palette />
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <FactoryProvider>
        <Frame />
      </FactoryProvider>
    </SessionProvider>
  );
}
