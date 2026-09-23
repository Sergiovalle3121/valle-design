import { IsDefined, IsObject } from 'class-validator';

/** The public endpoint accepts only a CAD snapshot, never a target document ID. */
export class CreateCadDemoShareDto {
  @IsDefined()
  @IsObject()
  document: Record<string, unknown>;
}
