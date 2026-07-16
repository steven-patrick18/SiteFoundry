import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export class GoogleAdsTagDto {
  @IsOptional() @IsString() conversion_id?: string;
  @IsOptional() @IsString() conversion_label?: string;
  @IsOptional() @IsString() remarketing_id?: string;
}

export class TrackingDto {
  @IsOptional() @IsString() @Matches(/^G-[A-Z0-9]{6,}$/i, { message: 'ga4_id must look like G-XXXXXXXXXX' })
  ga4_id?: string;

  @IsOptional() @IsString() @Matches(/^\d{6,}$/, { message: 'meta_pixel_id must be numeric' })
  meta_pixel_id?: string;

  @IsOptional() @ValidateNested() @Type(() => GoogleAdsTagDto)
  google_ads_tag?: GoogleAdsTagDto;

  @IsOptional() @IsString() @Matches(/^\d{5,}$/, { message: 'bing_uet_tag must be numeric' })
  bing_uet_tag?: string;

  @IsOptional() @IsString() @MaxLength(120)
  pushvault_property_key?: string;
}

export class CreateSiteDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsUUID() client_id!: string;
  @IsUUID() server_id!: string;
  @IsUUID() template_id!: string;

  @IsString()
  @Matches(DOMAIN_RE, { message: 'domain must be a bare domain like acdeals.example.com' })
  domain!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(DOMAIN_RE, { each: true, message: 'each extra domain must be a bare domain' })
  extra_domains?: string[];

  @IsString() @MaxLength(500)
  destination_url!: string;

  /** Extra store hostnames the compliance gate accepts for outbound offers. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(DOMAIN_RE, { each: true, message: 'each allowed host must be a bare domain' })
  extra_allowed_hosts?: string[];

  @IsObject()
  params!: Record<string, unknown>;

  @IsOptional() @ValidateNested() @Type(() => TrackingDto)
  tracking?: TrackingDto;

  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  /** Change the template (layout) of an existing site; params carry over. */
  @IsOptional() @IsUUID()
  template_id?: string;

  @IsOptional() @IsObject()
  params?: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(500)
  destination_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(DOMAIN_RE, { each: true })
  extra_domains?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(DOMAIN_RE, { each: true })
  extra_allowed_hosts?: string[];

  @IsOptional() @ValidateNested() @Type(() => TrackingDto)
  tracking?: TrackingDto;

  @IsOptional() @IsBoolean()
  ssl_auto_renew?: boolean;

  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;
}
