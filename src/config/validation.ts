import * as Joi from 'joi';

export default Joi.object({
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string()
    .required()
    .default(process.env.MONGO_URI || ''),
  JWT_SECRET: Joi.string().default(process.env.JWT_SECRET || ''),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default(process.env.NODE_ENV || 'development'),
});
