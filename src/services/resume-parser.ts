import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { ResumeData } from '../types/index.js';
import { logger } from '../utils/logger.js';

export async function parseResume(resumePath: string): Promise<ResumeData> {
  logger.action(`Parsing resume: ${resumePath}`);

  // Resolve path
  const absolutePath = path.resolve(resumePath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Resume file not found: ${absolutePath}`);
  }

  // Read PDF file
  const dataBuffer = fs.readFileSync(absolutePath);
  const pdfData = await pdf(dataBuffer);

  const rawText = pdfData.text;

  // Extract basic info using patterns
  const email = extractEmail(rawText);
  const phone = extractPhone(rawText);
  const name = extractName(rawText);
  const skills = extractSkills(rawText);
  const experience = extractExperience(rawText);
  const education = extractEducation(rawText);

  logger.success(`Resume parsed: ${pdfData.numpages} pages, ${rawText.length} characters`);

  if (email) logger.info(`  Email: ${email}`);
  if (phone) logger.info(`  Phone: ${phone}`);
  if (skills.length) logger.info(`  Skills found: ${skills.length}`);

  return {
    rawText,
    name,
    email,
    phone,
    skills,
    experience,
    education,
  };
}

function extractEmail(text: string): string | undefined {
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/i;
  const match = text.match(emailRegex);
  return match ? match[0] : undefined;
}

function extractPhone(text: string): string | undefined {
  // Match various phone formats
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/;
  const match = text.match(phoneRegex);
  return match ? match[0].trim() : undefined;
}

function extractName(text: string): string | undefined {
  // Usually the first line or first few words contain the name
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length > 0) {
    // Take first non-empty line, assume it's the name
    const firstLine = lines[0].trim();
    // If it looks like a name (2-4 words, no special chars except spaces)
    if (/^[A-Za-z\s]{2,50}$/.test(firstLine) && firstLine.split(/\s+/).length <= 4) {
      return firstLine;
    }
  }
  return undefined;
}

function extractSkills(text: string): string[] {
  const skills: Set<string> = new Set();

  // Common tech skills to look for
  const techKeywords = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go', 'Rust',
    'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Git',
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
    'HTML', 'CSS', 'SASS', 'REST', 'GraphQL', 'API',
    'Agile', 'Scrum', 'TDD', 'DevOps', 'Linux', 'Unix',
    'Machine Learning', 'AI', 'Data Science', 'NLP',
    'Project Management', 'Leadership', 'Communication',
  ];

  const textLower = text.toLowerCase();

  for (const skill of techKeywords) {
    if (textLower.includes(skill.toLowerCase())) {
      skills.add(skill);
    }
  }

  // Look for skills section and extract items
  const skillsSectionRegex = /(?:skills|technologies|technical skills|core competencies)[:\s]*([^]*?)(?=\n\n|education|experience|projects|$)/i;
  const skillsMatch = text.match(skillsSectionRegex);

  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    // Split by common delimiters
    const skillItems = skillsText.split(/[,•·|\n]+/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 50);
    skillItems.forEach((skill) => skills.add(skill));
  }

  return Array.from(skills);
}

function extractExperience(text: string): string[] {
  const experiences: string[] = [];

  // Look for experience section
  const expSectionRegex = /(?:experience|work history|employment)[:\s]*([^]*?)(?=\n\n(?:education|skills|projects)|$)/i;
  const expMatch = text.match(expSectionRegex);

  if (expMatch) {
    const expText = expMatch[1];
    // Split by date patterns or job title patterns
    const entries = expText.split(/\n(?=\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i);
    entries.forEach((entry) => {
      const trimmed = entry.trim();
      if (trimmed.length > 20) {
        experiences.push(trimmed);
      }
    });
  }

  return experiences;
}

function extractEducation(text: string): string[] {
  const education: string[] = [];

  // Look for education section
  const eduSectionRegex = /(?:education|academic|qualifications)[:\s]*([^]*?)(?=\n\n(?:experience|skills|projects)|$)/i;
  const eduMatch = text.match(eduSectionRegex);

  if (eduMatch) {
    const eduText = eduMatch[1];
    const entries = eduText.split(/\n/).filter((line) => line.trim().length > 10);
    entries.forEach((entry) => education.push(entry.trim()));
  }

  return education;
}

// Get the resume path for uploading
export function getResumeFilePath(resumePath: string): string {
  return path.resolve(resumePath);
}
