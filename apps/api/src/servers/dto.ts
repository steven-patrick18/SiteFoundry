import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9.:_-]+$/, { message: 'host must be a hostname or IP' })
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  ssh_username!: string;

  @IsIn(['ssh_key', 'password'])
  auth_type!: 'ssh_key' | 'password';

  @IsOptional()
  @IsString()
  private_key?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsIn(['hetzner', 'aws', 'contabo', 'do', 'other'])
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['hetzner', 'aws', 'contabo', 'do', 'other'])
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RotateCredentialDto {
  @IsIn(['ssh_key', 'password'])
  auth_type!: 'ssh_key' | 'password';

  @IsOptional()
  @IsString()
  private_key?: string;

  @IsOptional()
  @IsString()
  password?: string;
}
