'use client';

import RoleDashboard from '../components/RoleDashboard';

export default function EditorDashboard() {
  return (
    <RoleDashboard
      role="editor"
      title="Editor Dashboard"
      defaultRecordingStatus="RECORDED"
      filterFn={(video) => video.can_mark_edited || video.recording_status === 'RECORDED'}
    />
  );
}
