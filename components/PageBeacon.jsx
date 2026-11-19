'use client';
// One tiny page-view event per navigation for pages that don't already send one
// (home and Studio send landing_view). Feeds the first-party funnel and city stats.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { funnel } from '../lib/funnel';

const SKIP = /^\/(studio\/?)?$|^\/admin/;
export default function PageBeacon() {
  const path = usePathname();
  useEffect(() => { if (path && !SKIP.test(path)) funnel('page_view', { path }); }, [path]);
  return null;
}
