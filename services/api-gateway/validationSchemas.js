// services/api-gateway/validationSchemas.js
// Joi schemas for request validation

const Joi = require('joi');

const subtitleRequestSchema = Joi.object({
    type: Joi.string().valid('movie', 'series').required(),
    id: Joi.string().pattern(/^(tt\d{7,}|tmdb:\d+)$/).required(),
    season: Joi.number().integer().min(1).when('type', {
        is: 'series',
        then: Joi.required(),
        otherwise: Joi.optional()
    }),
    episode: Joi.number().integer().min(1).when('type', {
        is: 'series',
        then: Joi.required(),
        otherwise: Joi.optional()
    })
});

const subtitleQuerySchema = Joi.object({
    language: Joi.string().length(2).default('tr'),
    infoHash: Joi.string().alphanum().length(40).optional()
});

const validate = (schema, property) => {
    return (req, res, next) => {
        const { error } = schema.validate(req[property]);
        
        if (error) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.details.map(d => d.message)
            });
        }
        
        next();
    };
};

module.exports = {
    subtitleRequestSchema,
    subtitleQuerySchema,
    validate
};