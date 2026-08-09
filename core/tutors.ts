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
  { key: 'ADJOUA', name: 'Amina', gender: 'female', countries: ['CI', 'SN', 'CM', 'CG', 'FR', 'MA', 'TN', 'AE'], languages: ['fr', 'en'], persona: 'Chaleureuse, structurée et encourageante.', avatar: require('../assets/voices/adjoua.png') },
  { key: 'KOUADIO', name: 'Nabil', gender: 'male', countries: ['CI', 'SN', 'CM', 'CG', 'FR', 'MA', 'TN', 'AE'], languages: ['fr', 'en'], persona: 'Direct, pragmatique et orienté résultat.', avatar: require('../assets/voices/kouadio.png') },
  { key: 'NANA', name: 'Imara', gender: 'female', countries: ['GH', 'NG', 'KE'], languages: ['en', 'fr'], persona: 'Posée, précise et tournée vers la progression.', avatar: require('../assets/voices/nana.png') },
  { key: 'KAMAU', name: 'Kato', gender: 'male', countries: ['KE', 'GH', 'NG'], languages: ['en', 'sw'], persona: 'Calme, analytique et concret.', avatar: require('../assets/voices/kamau.png') },
  { key: 'KEMI', name: 'Sade', gender: 'female', countries: ['NG', 'GH'], languages: ['en', 'fr'], persona: 'Énergique, bienveillante et exigeante.', avatar: require('../assets/voices/kemi.png') },
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
  const available = regional.length ? regional : TUTORS.filter((tutor) => tutor.key === 'ADJOUA' || tutor.key === 'KOUADIO');
  return balancedPair(available);
}
