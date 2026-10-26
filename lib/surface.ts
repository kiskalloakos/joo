import { ViewStyle } from 'react-native';

// The shared "lit from above" raised-surface material — the container tier
// of the app's one light model (see the nav pill in app/(tabs)/_layout.tsx,
// which is the brighter focal tier). Spread this into a screen's
// card / heroCard style and keep borderRadius / padding / margin local:
//
//   card: { ...surface, borderRadius: 16, marginBottom: 16 }
//
// One source of truth so card styling stays consistent across screens.
export const surface: ViewStyle = {
  backgroundColor: '#171717',
  borderWidth: 1,
  borderColor: '#202020',
  borderTopColor: 'rgba(255,255,255,0.055)', // faint top-edge highlight
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.35,
  shadowRadius: 9,
  elevation: 3,
};
