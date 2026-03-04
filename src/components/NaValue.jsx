import React from 'react';

export default function NaValue({ reason = "Data not available" }) {
  return (
    <span
      title={reason}
      style={{ color: "#3a5a78", cursor: "help", fontSize: "inherit", fontWeight: 600 }}
    >
      N/A
    </span>
  );
}
