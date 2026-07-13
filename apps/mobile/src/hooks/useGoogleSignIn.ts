import { useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { signInWithGoogle, googleSignInErrorMessage } from '../services/googleAuth';

type Nav = NativeStackNavigationProp<any>;

export function useGoogleSignIn(navigation: Nav) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setTokens, setUser } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const idToken = await signInWithGoogle();
      const { data } = await api.post('/auth/google', { idToken });

      if (data.requiresPhone) {
        navigation.navigate('GoogleLinkPhone', {
          pendingToken: data.pendingToken,
          profile: data.profile,
        });
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      if (!data.user.name) {
        navigation.replace('Register');
      } else {
        navigation.replace('Main');
      }
    } catch (err: any) {
      const msg = googleSignInErrorMessage(err) || err.response?.data?.error || '';
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return { handleGoogleSignIn, loading, error };
}
