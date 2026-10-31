CREATE TABLE public.teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, color text NOT NULL DEFAULT '#ff8a00', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.players (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, name text NOT NULL);
CREATE TABLE public.matches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team1_id uuid REFERENCES public.teams(id) ON DELETE SET NULL, team2_id uuid REFERENCES public.teams(id) ON DELETE SET NULL, overs int NOT NULL, toss_winner_id uuid, toss_decision text, winner_id uuid, status text NOT NULL DEFAULT 'completed', result_text text, summary jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.innings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE, inning_number int NOT NULL, batting_team_id uuid, bowling_team_id uuid, total_runs int NOT NULL DEFAULT 0, total_wickets int NOT NULL DEFAULT 0, total_overs_bowled text NOT NULL DEFAULT '0.0');
CREATE TABLE public.ball_by_ball (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE, inning_id uuid NOT NULL REFERENCES public.innings(id) ON DELETE CASCADE, over_number int NOT NULL, ball_number int NOT NULL, bowler_id uuid, striker_id uuid, non_striker_id uuid, runs_scored int NOT NULL DEFAULT 0, extra_type text, extra_runs int NOT NULL DEFAULT 0, is_wicket boolean NOT NULL DEFAULT false, wicket_type text, "timestamp" timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['teams','players','matches','innings','ball_by_ball'] LOOP
 EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
 EXECUTE format('CREATE POLICY "public read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
 EXECUTE format('CREATE POLICY "public insert" ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', t);
 EXECUTE format('CREATE POLICY "public update" ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t);
 EXECUTE format('CREATE POLICY "public delete" ON public.%I FOR DELETE TO anon, authenticated USING (true)', t);
END LOOP; END $$;