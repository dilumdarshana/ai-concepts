// ObjectId conversio n settings
export type ObjectIdConversionMode = 'auto' | 'none' | 'force';

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}
export interface PromptTemplate {
  name: string;           // unique key
  description: string;    // brief summary
  template: string;       // the actual prompt text (can include placeholders)
  arguments: PromptArgument[];
};
