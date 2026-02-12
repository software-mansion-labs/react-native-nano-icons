import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoNanoIconsViewProps } from './ExpoNanoIcons.types';

const NativeView: React.ComponentType<ExpoNanoIconsViewProps> =
  requireNativeView('ExpoNanoIcons');

export default function ExpoNanoIconsView(props: ExpoNanoIconsViewProps) {
  return <NativeView {...props} />;
}
