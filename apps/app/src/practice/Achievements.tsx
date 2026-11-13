import { achievements, type History } from '@archsim/problems';
import { formatDate } from '../format';

export function Achievements({ history }: { history: History }) {
  const list = achievements(history);
  return (
    <section className="achievements" aria-labelledby="achievements-title">
      <h3 id="achievements-title">Conquistas</h3>
      <ul>
        {list.map((a) => (
          <li key={a.id} className={a.at ? 'earned' : 'locked'}>
            <strong>{a.title}</strong>
            <span className="muted">{a.description}</span>
            <span className="num">{a.at ? `conquistada em ${formatDate(a.at)}` : 'bloqueada'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
