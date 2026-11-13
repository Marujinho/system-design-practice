import './canvas/canvas.css';
import { LoadPanel } from './panels/LoadPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ProblemList } from './practice/ProblemList';
import { ProblemView } from './practice/ProblemView';
import './practice/practice.css';
import './panels/panels.css';
import { hrefOf, type Route } from './routes';
import { ThemeToggle } from './theme/ThemeToggle';
import { useRoute } from './useRoute';
import { Workspace } from './workspace/Workspace';

function Home() {
  return (
    <section className="home" aria-labelledby="home-title">
      <h2 id="home-title">Treine system design desenhando arquiteturas que reagem à carga</h2>
      <p>
        Escolha um problema clássico de entrevista, monte a arquitetura na AWS e veja onde ela
        quebra. O objetivo: atender a todos os requisitos pelo menor custo.
      </p>
      <nav aria-label="Começar">
        <a className="button primary" href={hrefOf({ screen: 'problems' })}>
          Praticar um problema
        </a>
        <a className="button" href={hrefOf({ screen: 'free' })}>
          Canvas livre
        </a>
      </nav>
    </section>
  );
}

function NotFound() {
  return (
    <section className="home">
      <h2>Tela não encontrada</h2>
      <a className="button" href={hrefOf({ screen: 'home' })}>
        Voltar ao início
      </a>
    </section>
  );
}

export function Screen({ route }: { route: Route }) {
  switch (route.screen) {
    case 'home':
      return <Home />;
    case 'problems':
      return <ProblemList />;
    case 'problem':
      return <ProblemView key={route.problemId} problemId={route.problemId} />;
    case 'free':
      return <Workspace mode={{ kind: 'free' }} top={<LoadPanel />} side={<PropertiesPanel />} />;
    default:
      return <NotFound />;
  }
}

export function App() {
  const route = useRoute();
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          <a href={hrefOf({ screen: 'home' })}>ARCHSIM</a>
        </h1>
        <ThemeToggle />
      </header>
      <main>
        <Screen route={route} />
      </main>
    </div>
  );
}
