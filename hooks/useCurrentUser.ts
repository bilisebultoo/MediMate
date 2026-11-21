import { useUserProfiles } from '@/context/UserContext';

export function useCurrentUser() {
  return useUserProfiles().activeProfile;
}
