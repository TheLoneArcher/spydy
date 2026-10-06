export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: 'civilian' | 'dispatcher' | 'admin';
          is_active: boolean;
          avatar_url: string | null;
          phone: string | null;
          bio: string | null;
          home_area: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          role?: 'civilian' | 'dispatcher' | 'admin';
          is_active?: boolean;
          avatar_url?: string | null;
          phone?: string | null;
          bio?: string | null;
          home_area?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: 'civilian' | 'dispatcher' | 'admin';
          is_active?: boolean;
          avatar_url?: string | null;
          phone?: string | null;
          bio?: string | null;
          home_area?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          title: string;
          description: string;
          category: string;
          severity: 'critical' | 'moderate' | 'low';
          status:
            | 'pending'
            | 'triaged'
            | 'assigned'
            | 'in_progress'
            | 'resolved_pending_confirmation'
            | 'closed'
            | 'reopened'
            | 'rejected'
            | 'duplicate';
          location: unknown;
          location_label: string | null;
          required_skill: string | null;
          is_anonymous: boolean;
          duplicate_of: string | null;
          duplicate_count: number;
          seed_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          title: string;
          description: string;
          category?: string;
          severity?: 'critical' | 'moderate' | 'low';
          status?:
            | 'pending'
            | 'triaged'
            | 'assigned'
            | 'in_progress'
            | 'resolved_pending_confirmation'
            | 'closed'
            | 'reopened'
            | 'rejected'
            | 'duplicate';
          location: unknown;
          location_label?: string | null;
          required_skill?: string | null;
          is_anonymous?: boolean;
          duplicate_of?: string | null;
          duplicate_count?: number;
          seed_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          title?: string;
          description?: string;
          category?: string;
          severity?: 'critical' | 'moderate' | 'low';
          status?:
            | 'pending'
            | 'triaged'
            | 'assigned'
            | 'in_progress'
            | 'resolved_pending_confirmation'
            | 'closed'
            | 'reopened'
            | 'rejected'
            | 'duplicate';
          location?: unknown;
          location_label?: string | null;
          required_skill?: string | null;
          is_anonymous?: boolean;
          duplicate_of?: string | null;
          duplicate_count?: number;
          seed_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_duplicate_of_fkey';
            columns: ['duplicate_of'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          }
        ];
      };
      volunteer_profiles: {
        Row: {
          user_id: string;
          skills: string[];
          location: unknown;
          on_duty: boolean;
          max_radius_km: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          skills?: string[];
          location?: unknown;
          on_duty?: boolean;
          max_radius_km?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          skills?: string[];
          location?: unknown;
          on_duty?: boolean;
          max_radius_km?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'volunteer_profiles_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      tasks: {
        Row: {
          id: string;
          report_id: string;
          volunteer_id: string | null;
          assigned_by: string | null;
          status:
            | 'assigned'
            | 'accepted'
            | 'en_route'
            | 'on_site'
            | 'in_progress'
            | 'completed'
            | 'blocked';
          notes: string | null;
          assigned_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          volunteer_id?: string | null;
          assigned_by?: string | null;
          status?:
            | 'assigned'
            | 'accepted'
            | 'en_route'
            | 'on_site'
            | 'in_progress'
            | 'completed'
            | 'blocked';
          notes?: string | null;
          assigned_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          volunteer_id?: string | null;
          assigned_by?: string | null;
          status?:
            | 'assigned'
            | 'accepted'
            | 'en_route'
            | 'on_site'
            | 'in_progress'
            | 'completed'
            | 'blocked';
          notes?: string | null;
          assigned_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_volunteer_id_fkey';
            columns: ['volunteer_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      report_events: {
        Row: {
          id: string;
          report_id: string;
          actor_id: string | null;
          kind: string;
          message: string;
          visibility: 'public' | 'staff';
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          actor_id?: string | null;
          kind: string;
          message: string;
          visibility?: 'public' | 'staff';
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          actor_id?: string | null;
          kind?: string;
          message?: string;
          visibility?: 'public' | 'staff';
          created_at?: string;
        };
        Relationships: [];
      };
      report_votes: {
        Row: {
          report_id: string;
          user_id: string;
          value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          report_id: string;
          user_id: string;
          value: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          report_id?: string;
          user_id?: string;
          value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      report_media: {
        Row: {
          id: string;
          report_id: string;
          uploaded_by: string | null;
          kind: 'original' | 'admin' | 'update' | 'after' | 'dispute';
          storage_path: string;
          sha256: string | null;
          phash: string | null;
          phash_bigint: number | null;
          lat: number | null;
          lng: number | null;
          accuracy_m: number | null;
          captured_at: string | null;
          capture_nonce: string | null;
          ai_label: Json | null;
          ai_confidence: number | null;
          ai_model: string | null;
          verified: boolean;
          exif_stripped: boolean;
          is_after: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          uploaded_by?: string | null;
          kind?: 'original' | 'admin' | 'update' | 'after' | 'dispute';
          storage_path: string;
          sha256?: string | null;
          phash?: string | null;
          phash_bigint?: number | null;
          lat?: number | null;
          lng?: number | null;
          accuracy_m?: number | null;
          captured_at?: string | null;
          capture_nonce?: string | null;
          ai_label?: Json | null;
          ai_confidence?: number | null;
          ai_model?: string | null;
          verified?: boolean;
          exif_stripped?: boolean;
          is_after?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          uploaded_by?: string | null;
          kind?: 'original' | 'admin' | 'update' | 'after' | 'dispute';
          storage_path?: string;
          sha256?: string | null;
          phash?: string | null;
          phash_bigint?: number | null;
          lat?: number | null;
          lng?: number | null;
          accuracy_m?: number | null;
          captured_at?: string | null;
          capture_nonce?: string | null;
          ai_label?: Json | null;
          ai_confidence?: number | null;
          ai_model?: string | null;
          verified?: boolean;
          exif_stripped?: boolean;
          is_after?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      volunteer_applications: {
        Row: {
          id: string;
          user_id: string;
          motivation: string | null;
          availability: Json;
          radius_km: number;
          location: unknown;
          phone: string | null;
          status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          motivation?: string | null;
          availability?: Json;
          radius_km?: number;
          location?: unknown;
          phone?: string | null;
          status?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          motivation?: string | null;
          availability?: Json;
          radius_km?: number;
          location?: unknown;
          phone?: string | null;
          status?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          id: number;
          slug: string;
          label: string;
        };
        Insert: {
          id?: number;
          slug: string;
          label: string;
        };
        Update: {
          id?: number;
          slug?: string;
          label?: string;
        };
        Relationships: [];
      };
      volunteer_skills: {
        Row: {
          user_id: string;
          skill_id: number;
          level: 'beginner' | 'intermediate' | 'expert';
        };
        Insert: {
          user_id: string;
          skill_id: number;
          level?: 'beginner' | 'intermediate' | 'expert';
        };
        Update: {
          user_id?: string;
          skill_id?: number;
          level?: 'beginner' | 'intermediate' | 'expert';
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          read: boolean;
          link: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          read?: boolean;
          link?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          read?: boolean;
          link?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      capture_challenges: {
        Row: {
          nonce: string;
          user_id: string;
          expires_at: string;
          used: boolean;
          created_at: string;
        };
        Insert: {
          nonce?: string;
          user_id: string;
          expires_at: string;
          used?: boolean;
          created_at?: string;
        };
        Update: {
          nonce?: string;
          user_id?: string;
          expires_at?: string;
          used?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      service_areas: {
        Row: {
          id: string;
          name: string;
          geom: unknown;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          geom: unknown;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          geom?: unknown;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      resources: {
        Row: {
          id: string;
          name: string;
          category: string;
          quantity_total: number;
          quantity_available: number;
          location_label: string;
          managed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          quantity_total: number;
          quantity_available: number;
          location_label: string;
          managed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          quantity_total?: number;
          quantity_available?: number;
          location_label?: string;
          managed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      volunteer_public: {
        Row: {
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          skills: string[];
          lat: number | null;
          lon: number | null;
          on_duty: boolean;
        };
      };
      report_vote_summary: {
        Row: {
          report_id: string;
          up: number;
          down: number;
          score: number;
          my_vote: number | null;
        };
      };
      report_priority: {
        Row: {
          id: string;
          title: string;
          status: string;
          severity: string;
          score: number;
        };
      };
    };
    Functions: {
      auth_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      ensure_profile: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      admin_set_role: {
        Args: { p_user: string; p_role: string };
        Returns: void;
      };
      admin_set_active: {
        Args: { p_user: string; p_active: boolean };
        Returns: void;
      };
      apply_volunteer: {
        Args: {
          p_skills: string[];
          p_lat: number;
          p_lon: number;
          p_radius_km: number;
          p_availability: Json;
          p_motivation: string;
          p_phone: string;
        };
        Returns: string;
      };
      review_volunteer_application: {
        Args: {
          p_application: string;
          p_decision: string;
          p_note?: string;
        };
        Returns: void;
      };
      set_volunteer_availability: {
        Args: { p_on_duty: boolean };
        Returns: void;
      };
      withdraw_volunteer: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      submit_report: {
        Args: {
          p_title: string;
          p_description: string;
          p_category: string;
          p_severity: string;
          p_lat: number;
          p_lon: number;
          p_label: string;
          p_media_id?: string | null;
          p_is_anonymous?: boolean;
        };
        Returns: string;
      };
      vote_report: {
        Args: {
          p_report: string;
          p_value: number;
        };
        Returns: {
          upvotes: number;
          downvotes: number;
          score: number;
          my_vote: number;
        }[];
      };
      find_similar_reports: {
        Args: {
          p_lat: number;
          p_lon: number;
          p_category: string;
          p_title: string;
          p_phash?: number | null;
        };
        Returns: {
          id: string;
          title: string;
          description: string;
          category: string;
          severity: string;
          status: string;
          created_at: string;
          location_label: string | null;
          distance_m: number;
          title_sim: number;
          phash_distance: number | null;
          score: number;
          media_path: string | null;
        }[];
      };
      merge_report: {
        Args: {
          p_dup: string;
          p_into: string;
        };
        Returns: void;
      };
      in_service_area: {
        Args: {
          p_lat: number;
          p_lon: number;
        };
        Returns: boolean;
      };
      feed_reports: {
        Args: {
          p_lat?: number | null;
          p_lon?: number | null;
          p_sort?: string;
          p_status?: string[] | null;
          p_category?: string[] | null;
          p_radius_km?: number | null;
          p_mine?: boolean;
          p_limit?: number;
          p_cursor?: Json | null;
        };
        Returns: {
          id: string;
          title: string;
          description: string;
          category: string;
          severity: string;
          status: string;
          created_at: string;
          location_label: string | null;
          lat: number;
          lon: number;
          distance_m: number | null;
          up: number;
          down: number;
          score: number;
          my_vote: number | null;
          media_path: string | null;
          ai_label: string | null;
          reporter_name: string;
          reporter_avatar: string | null;
          duplicate_count: number;
          priority: number;
        }[];
      };
    };
  };
}
