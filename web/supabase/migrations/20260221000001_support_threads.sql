-- Support system tables
CREATE TABLE IF NOT EXISTS support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  subject text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'waiting_on_customer', 'resolved', 'closed')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  tags text[],
  assigned_to text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES support_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'admin', 'system')),
  sender_id uuid,
  sender_email text,
  body text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_threads_user_id ON support_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads(status);
CREATE INDEX IF NOT EXISTS idx_support_threads_last_message ON support_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, created_at ASC);

-- RLS
ALTER TABLE support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own threads"
  ON support_threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view non-internal messages in own threads"
  ON support_messages FOR SELECT
  USING (
    NOT is_internal
    AND thread_id IN (SELECT id FROM support_threads WHERE user_id = auth.uid())
  );

-- Use existing trigger function
CREATE TRIGGER support_threads_updated_at
  BEFORE UPDATE ON support_threads
  FOR EACH ROW
  EXECUTE FUNCTION ff_set_updated_at();
