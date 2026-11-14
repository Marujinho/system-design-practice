export type Route =
  | { screen: 'home' }
  | { screen: 'free' }
  | { screen: 'problems' }
  | { screen: 'problem'; problemId: string }
  | { screen: 'study'; problemId: string }
  | { screen: 'not-found' };

/** #/, #/free, #/problems, #/problems/<id>, #/problems/<id>/study */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/') return { screen: 'home' };
  if (path === '/free') return { screen: 'free' };
  if (path === '/problems') return { screen: 'problems' };
  const m = /^\/problems\/([a-z][a-z0-9-]{0,63})$/.exec(path);
  if (m?.[1]) return { screen: 'problem', problemId: m[1] };
  const study = /^\/problems\/([a-z][a-z0-9-]{0,63})\/study$/.exec(path);
  if (study?.[1]) return { screen: 'study', problemId: study[1] };
  return { screen: 'not-found' };
}

export function hrefOf(route: Route): string {
  switch (route.screen) {
    case 'home':
      return '#/';
    case 'free':
      return '#/free';
    case 'problems':
      return '#/problems';
    case 'problem':
      return `#/problems/${route.problemId}`;
    case 'study':
      return `#/problems/${route.problemId}/study`;
    case 'not-found':
      return '#/';
  }
}
