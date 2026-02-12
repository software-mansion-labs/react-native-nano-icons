import * as React from 'react';

import { ExpoNanoIconsViewProps } from './ExpoNanoIcons.types';

export default function ExpoNanoIconsView(props: ExpoNanoIconsViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
