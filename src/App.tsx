import { useEffect } from 'react';
import { useAuthStore } from '@core/store/auth.store';
import { useGameStore } from '@core/store/game.store';
import { LoginScreen } from './modules/auth/ui/screens/LoginScreen';
import { InviteAcceptScreen } from './modules/auth/ui/screens/InviteAcceptScreen';
import { OfficeSelectScreen } from './modules/office/ui/screens/OfficeSelectScreen';
import { GameContainer } from './modules/spatial/ui/GameContainer';

function App() {
  const { isAuthenticated, hydrate } = useAuthStore();
  const currentOfficeId = useGameStore((s) => s.currentOfficeId);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const path = window.location.pathname;
  if (path.startsWith('/invite/')) return <InviteAcceptScreen />;

  if (!isAuthenticated) return <LoginScreen />;
  if (!currentOfficeId) return <OfficeSelectScreen />;
  
  return <GameContainer />;
}

export default App;