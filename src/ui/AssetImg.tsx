import { useState } from 'react';

interface Props {
  src: string;
  /** Эмодзи-заглушка, если картинки нет. */
  fallback: string;
  className?: string;
  alt?: string;
}

export function AssetImg({ src, fallback, className, alt = '' }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`asset-fallback ${className ?? ''}`}>{fallback}</span>;
  return <img src={src} alt={alt} className={className} draggable={false} onError={() => setFailed(true)} />;
}
