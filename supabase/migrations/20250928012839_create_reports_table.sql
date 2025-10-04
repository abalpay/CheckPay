-- Create reports table
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  report_data JSONB NOT NULL,
  total_claims INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  pay_period_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own reports
CREATE POLICY "Users can read own reports" ON reports
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy for users to insert their own reports
CREATE POLICY "Users can insert own reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy for users to update their own reports
CREATE POLICY "Users can update own reports" ON reports
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy for users to delete their own reports
CREATE POLICY "Users can delete own reports" ON reports
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster user queries
CREATE INDEX reports_user_id_idx ON reports(user_id);
CREATE INDEX reports_created_at_idx ON reports(created_at DESC);
