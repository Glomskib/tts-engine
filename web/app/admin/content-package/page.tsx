import { redirect } from 'next/navigation';

export default function ContentPackagePage() {
  redirect('/admin/calendar?view=grid');
}
