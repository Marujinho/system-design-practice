import { achievements, type History } from '@archsim/problems';
import { formatDate } from '../format';
import { useLang } from '../i18n/store';
import { useT } from '../i18n/t';

export function Achievements({ history }: { history: History }) {
  const t = useT();
  const lang = useLang();
  const list = achievements(history);
  return (
    <section className="achievements" aria-labelledby="achievements-title">
      <h3 id="achievements-title">{t('ach.title')}</h3>
      <ul>
        {list.map((a) => (
          <li key={a.id} className={a.at ? 'earned' : 'locked'}>
            <strong>{lang === 'en' ? a.en.title : a.title}</strong>
            <span className="muted">{lang === 'en' ? a.en.description : a.description}</span>
            <span className="num">
              {a.at ? t('ach.earned', { date: formatDate(a.at) }) : t('ach.locked')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
