import React from 'react';

type Props = { children: React.ReactNode };

const WebFontProvider = ({ children }: Props) => {
  // no-op for native
  return <>{children}</>;
};

export default WebFontProvider;
