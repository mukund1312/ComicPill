// A different person signing up on this phone starts from a clean slate:
// their own library, history, taste and setup. In dev builds the testing
// shelf is put back, so there is always something to try. The catalog is untouched.
import { clearUserData } from './userData';
import { invalidateProfile } from './profile';
import { restoreDemoShelf } from '../seed/claim';

export function startFreshAccount(now: Date): void {
  clearUserData();
  restoreDemoShelf();
  invalidateProfile(now);
}
