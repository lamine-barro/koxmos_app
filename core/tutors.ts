import type { ImageSourcePropType } from 'react-native';

export type TutorKey = string;
export type Tutor = {
  key: TutorKey;
  name: string;
  gender: 'female' | 'male';
  countries: string[];
  languages: string[];
  persona: string;
  avatar: ImageSourcePropType;
};

// Public tutor identities. The server maps each identity to a fixed OpenAI voice.
export const TUTORS: Tutor[] = [
  { key: 'AWA', name: 'Awa', gender: 'female', countries: ['CI', 'CM', 'CG', 'FR', 'MA', 'TN', 'SN', 'AE', 'EG', 'GH', 'KE', 'NG', 'US'], languages: ['fr', 'en'], persona: 'Chaleureuse et structurée : elle clarifie, rassure et transforme chaque réponse en plan d’action.', avatar: require('../assets/voices/adjoua.png') },
  { key: 'LYNA', name: 'Lyna', gender: 'female', countries: ['CI', 'CM', 'CG', 'FR', 'MA', 'TN', 'SN', 'AE', 'EG', 'GH', 'KE', 'NG', 'US'], languages: ['fr', 'en'], persona: 'Énergique et créative : elle fait pratiquer, valorise les progrès et développe la confiance.', avatar: require('../assets/voices/nana.png') },
  { key: 'MALIK', name: 'Malik', gender: 'male', countries: ['CI', 'CM', 'CG', 'FR', 'MA', 'TN', 'SN', 'AE', 'EG', 'GH', 'KE', 'NG', 'US'], languages: ['fr', 'en'], persona: 'Calme et exigeant : il raisonne avec précision, challenge avec respect et vise l’autonomie.', avatar: require('../assets/voices/kouadio.png') },
];

function balancedPair<T extends { gender: 'female' | 'male' }>(items: T[]): T[] {
  const woman = items.find((item) => item.gender === 'female');
  const man = items.find((item) => item.gender === 'male');
  return woman && man ? [woman, man] : items.slice(0, 2);
}

export function tutorForKey(key?: string) { return TUTORS.find((tutor) => tutor.key === key) || TUTORS[0]; }
export function tutorsForCountry(country: string) {
  const code = country.trim().toUpperCase();
  const regional = TUTORS.filter((tutor) => tutor.countries.includes(code));
  return regional.length ? regional : TUTORS;
}
