import * as Joi from 'joi';

export default Joi.object({
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string()
    .required()
    .default(process.env.MONGO_URI || ''),
  JWT_SECRET: Joi.string().default(process.env.JWT_SECRET || ''),
  CLOUDINARY_API_KEY: Joi.string()
    .required()
    .default(process.env.CLOUDINARY_API_KEY || ''),
  CLOUDINARY_API_SECRET: Joi.string()
    .required()
    .default(process.env.CLOUDINARY_API_SECRET || ''),
  CLOUDINARY_URL: Joi.string()
    .required()
    .default(process.env.CLOUDINARY_URL || ''),
  ENVIRONMENT: Joi.string()
    .valid('development', 'production', 'test')
    .default(process.env.ENVIRONMENT || 'development'),
});
