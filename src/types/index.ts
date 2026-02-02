export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  jobType?: string;
  description: string;
  requirements: string[];
  url: string;
  postedDate?: string;
}

export interface JobMatch {
  job: JobListing;
  score: number;
  reasoning: string;
  keyMatches: string[];
  concerns: string[];
}

export interface ApplicationResult {
  jobId: string;
  jobTitle: string;
  company: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  timestamp: Date;
}

export interface BotConfig {
  jobListingUrl: string;
  maxApplications?: number;
  headless: boolean;
  slowMo: number;
  jobNiches: string[];
}

export interface FormField {
  type: 'text' | 'email' | 'tel' | 'textarea' | 'file' | 'select' | 'checkbox';
  name: string;
  label?: string;
  required: boolean;
  selector: string;
}
