'use client';

import RoleDashboard from '../components/RoleDashboard';

export default function UploaderDashboard() {
  return (
    <RoleDashboard
      role="uploader"
      title="Uploader Dashboard"
      defaultRecordingStatus="READY_TO_POST"
      filterFn={(video) => video.can_mark_posted || video.recording_status === 'READY_TO_POST'}
    />
  );
}
