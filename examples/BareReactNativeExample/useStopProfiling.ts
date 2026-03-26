import { useEffect, useState } from 'react';
import { stopProfiling } from 'react-native-release-profiler';

export const useStopProfiling = () => {
  const [path, setPath] = useState('');

  const handleStopProfiling = async () => {
    const path = await stopProfiling(true);
    setPath(path);
  };

  useEffect(() => {
    handleStopProfiling();
  }, []);

  return path;
};
