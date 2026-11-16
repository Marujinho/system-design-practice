import './canvas/canvas.css';
import { LoadPanel } from './panels/LoadPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ProblemList } from './practice/ProblemList';
import { ProblemView } from './practice/ProblemView';
import { StudyView } from './practice/StudyView';
import './practice/practice.css';
import './panels/panels.css';
import { hrefOf, type Route } from './routes';
import { LanguageToggle } from './i18n/LanguageToggle';
import { useT } from './i18n/t';
import { ThemeToggle } from './theme/ThemeToggle';
import { useRoute } from './useRoute';
import { Workspace } from './workspace/Workspace';

function Home() {
  const t = useT();
  return (
    <section className="home" aria-labelledby="home-title">
      <h2 id="home-title">{t('home.title')}</h2>
      <p>{t('home.lead')}</p>
      <nav aria-label={t('home.start')}>
        <a className="button primary" href={hrefOf({ screen: 'problems' })}>
          {t('home.practice')}
        </a>
        <a className="button" href={hrefOf({ screen: 'free' })}>
          {t('home.free')}
        </a>
      </nav>
    </section>
  );
}

function NotFound() {
  const t = useT();
  return (
    <section className="home">
      <h2>{t('notFound.title')}</h2>
      <a className="button" href={hrefOf({ screen: 'home' })}>
        {t('notFound.back')}
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
    case 'study':
      return <StudyView key={route.problemId} problemId={route.problemId} />;
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
        <div className="app-header-tools">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>
      <main>
        <Screen route={route} />
      </main>
    </div>
  );
}
