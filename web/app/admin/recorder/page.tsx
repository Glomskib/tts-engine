'use client';

import RoleDashboard from '../components/RoleDashboard';

export default function RecorderDashboard() {
  return (
    <RoleDashboard
      role="recorder"
      title="Recorder Dashboard"
      defaultRecordingStatus="NOT_RECORDED"
      filterFn={(video) => video.can_record}
    />
  );
}
