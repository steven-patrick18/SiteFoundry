import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export const TEMPLATE_CATEGORIES = [
  'ecom_showcase',
  'offer_awareness',
  'comparison',
  'lead_page',
  'prelander',
  'retailers',
] as const;

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(TEMPLATE_CATEGORIES as unknown as string[])
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** JSON Schema — arrives as string in multipart, object in JSON bodies. */
  param_schema!: unknown;

  @IsOptional()
  @IsUrl()
  preview_image_url?: string;
}
