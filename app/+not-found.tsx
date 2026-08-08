import { Redirect } from 'expo-router';

/**
 * A bare `koxmos:///` deep link has no path segment.  Always take the user
 * back to the app entry point instead of exposing Expo Router's error page.
 */
export default function UnmatchedRoute() {
  return <Redirect href="/" />;
}
