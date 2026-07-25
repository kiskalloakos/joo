import React from 'react';
import { Text as NativeText, type TextProps } from 'react-native';

// Explicit screen styles otherwise replace Text.defaultProps entirely. This
// wrapper puts Geist first in every style array, so app typography is visible
// even where a screen supplies its own size, colour, and weight.
export const AppText = React.forwardRef<NativeText, TextProps>(({ style, ...props }, ref) => (
  <NativeText ref={ref} {...props} style={[{ fontFamily: 'Geist' }, style]} />
));

AppText.displayName = 'AppText';
